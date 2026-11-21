// The call log (HEX_CALL_LOG=1, off by default): every hexAPI call that crosses page.evaluate,
// with its answer, one JSON line each, so a run can be replayed offline on another engine
// (hex-core's hex-engine). The bridge imports this file only when the switch is on.
//
// The file: <HEX_CALL_LOG_DIR or runs/calls>/<opened-at>-<8 hex>/calls.jsonl. The bridge is
// not told the run's folder (runSession makes it and opens the bridge with { headless } alone),
// so the log has a folder of its own, named by the time it was opened in the format of a
// run id; its head line says when, and a run's calls.jsonl is the one whose openedAt is its
// runId's time (the bridge is opened a few ms after the id is taken).
//
// Line 0: { schema: 'hex-agent-calls/1', openedAt, url, version, build }.
// Then one line a call: { n, t, ctx, member, args, ok: true, result }
//                    or { n, t, ctx, member, args, ok: false, error: { code, message } }:
// n counts the calls as they are made, from 0, over both contexts; t is ms from the log's
// opening to the call; ctx is 'main' or 'fresh' (the context hex.fresh() opens). A timeout
// is an answer too (error.code CALL_TIMEOUT). Lines are written in the order the answers
// came; nothing is summarised.
//
// A line is written after its answer is returned, never inside the call's timeout, and a
// write that fails never fails a call: the failures are counted and said once, at close.
import { appendFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

export const CALL_LOG_SCHEMA = 'hex-agent-calls/1';

export const callLogOn = () => process.env.HEX_CALL_LOG === '1';

export function openCallLog({ url, root = process.env.HEX_CALL_LOG_DIR || 'runs/calls', now = () => Date.now() } = {}) {
  const t0 = now();
  const openedAt = new Date(t0).toISOString();
  const dir = join(root, `${openedAt.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`);
  const path = join(dir, 'calls.jsonl');
  let n = 0;
  let headed = false;
  let chain = Promise.resolve();
  const failed = { count: 0, first: null };
  const write = (obj) => {
    let text;
    try {
      text = JSON.stringify(obj) + '\n';
    } catch (e) {
      failed.count++;
      failed.first ??= String(e.message);
      return;
    }
    chain = chain
      .then(() => mkdir(dir, { recursive: true }))
      .then(() => appendFile(path, text))
      .catch((e) => {
        failed.count++;
        failed.first ??= String(e.message);
      });
  };
  return {
    path,
    failed,
    // once, from the first context that loads: what answered
    head({ version, build }) {
      if (headed) return;
      headed = true;
      write({ schema: CALL_LOG_SCHEMA, openedAt, url, version, build });
    },
    // one call: its answer (or its error) is returned or thrown first, the line written after
    async around(ctx, member, args, run) {
      const line = { n: n++, t: now() - t0, ctx, member, args };
      try {
        const result = await run();
        queueMicrotask(() => write({ ...line, ok: true, result }));
        return result;
      } catch (e) {
        queueMicrotask(() => write({ ...line, ok: false, error: { code: e?.code ?? null, message: String(e?.message ?? e) } }));
        throw e;
      }
    },
    // every line queued is on disk (or counted failed); failures said once
    async end() {
      await new Promise((r) => setImmediate(r));
      await chain;
      if (failed.count) console.error(`call log: ${failed.count} line(s) not written to ${path} (first: ${failed.first})`);
    },
  };
}
