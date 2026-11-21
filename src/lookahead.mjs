// LOOK BEFORE ACTING (HEX_LOOKAHEAD=1, off by default): beside the page, a shadow session on
// hex-core's engine (a `hex-engine serve` child, src/engine-backend.mjs), and the tool
// try_ops, which answers a batch of ops from the shadow without touching the page.
//   HEX_ENGINE_BIN, HEX_ENGINE_RECORDS  as for offline mode
// The bridge loads this file only when the switch is on and the backend is the browser.
//
// THE SHADOW IS KEPT IN STEP FROM THE PAGE, never from its own answers: after every write the
// page accepted, the page's link is stale; before the next try the page's own link is taken
// (toUrl, one page call) and loaded on the engine. After a try the engine is put back on that
// link, so the next try starts where the page is. Where the engine cannot hold the page's
// build (a prop, soil: it loads the link but reads no state of it), try_ops answers
// "not available for this build" until it can again.
import { openChild } from './engine-backend.mjs';

const WRITES = new Set(['apply', 'applyAll', 'load', 'undo', 'redo']);

export const TRY_OPS_SPEC = {
  name: 'try_ops',
  description:
    'Try a batch before you apply it, cheaply: the same argument as apply ({"ops":[...], "atomic"?}), answered by an offline copy of the ' +
    "configurator's rules kept in step with this build. Each op comes back accepted (with what it would add) or refused with the code and " +
    'message apply would give; nothing is changed and nothing counts against the op budget. Use it to compare alternatives before apply. ' +
    'It cannot say what the live page decides itself (its collision gate, MESH_CLASH), props or soil (addProp, plant, fillSoil, ...): ' +
    'those come back "cannot say", never guessed; apply stays the only answer that counts.',
  parameters: {
    type: 'object',
    properties: {
      ops: { type: 'array', items: { type: 'object' }, description: 'As for apply: {"socket":"s12"} items or full op objects.' },
      atomic: { type: 'boolean', description: 'As for apply (default true).' },
    },
    required: ['ops'],
    additionalProperties: false,
  },
};

/** The answer for the model: each outcome as apply summarises it, but its own words. */
function summarise(answer) {
  return {
    rolledBack: answer.rolledBack,
    outcomes: answer.outcomes.map((o) =>
      o.ok
        ? { ok: true, op: o.op?.op, added: o.added ?? [], ...(o.warnings?.length ? { warnings: o.warnings.map((w) => w.code) } : {}) }
        : { ok: false, op: o.op?.op, code: o.code, message: o.message, ...(o.details?.tryInstead ? { tryInstead: o.details.tryInstead } : {}) },
    ),
  };
}

/** The page's hex with a shadow beside it: calls go to the page as before. */
export async function withLookahead(hex, { open = openChild } = {}) {
  const child = await open();
  let pageLink = null; // the page's link, null after a write it accepted
  let shadowAt = null; // the link the shadow holds
  const call = async (member, ...args) => {
    const r = await hex.call(member, ...args);
    if (WRITES.has(member)) pageLink = null;
    return r;
  };
  // the shadow on the page's build, or why it cannot be
  async function inStep() {
    pageLink ??= await hex.call('toUrl');
    if (shadowAt === pageLink) return { ok: true };
    shadowAt = null;
    await child.send({ control: 'new', build: 'empty' });
    const loaded = await child.send({ member: 'load', args: [pageLink] });
    if (loaded.kind !== 'answer' || loaded.result?.ok !== true) return { ok: false, why: loaded.why ?? loaded.result?.message ?? 'the page\'s link did not load' };
    const read = await child.send({ member: 'toUrl', args: [] });
    if (read.kind !== 'answer') return { ok: false, why: read.why ?? 'the engine holds no state of this build' };
    shadowAt = pageLink;
    return { ok: true };
  }
  const lookahead = {
    /** try_ops: `ctx` is the tool layer's own resolution of socket ids and roles. */
    async tryOps({ ops, atomic = true } = {}, { resolve, liveRefs, takeRole, onEvent = () => {} }) {
      if (!Array.isArray(ops) || ops.length === 0) throw new Error('ops must be a non-empty array');
      const t0 = Date.now();
      const refs = await liveRefs();
      const resolved = [];
      for (const item of ops) resolved.push(await resolve(takeRole(item)[0], refs));
      let answer;
      const step = await inStep();
      if (!step.ok) {
        answer = { available: false, note: `not available for this build: ${step.why}` };
      } else {
        const out = await child.send({ member: 'applyAll', args: [resolved, atomic ? {} : { keepGoing: true }] });
        if (out.kind === 'answer') answer = { available: true, ...summarise(out.result), raw: out.result };
        else answer = { available: true, cannotSay: true, note: `the engine cannot say: ${out.why ?? out.message ?? out.kind}` };
        // put back where the page is: the try changed the shadow, not the page
        shadowAt = null;
        await inStep();
      }
      const { raw, ...forModel } = answer;
      onEvent({ type: 'try_ops', ops: resolved, atomic, answer: answer.raw ? { ...forModel, raw } : forModel, ms: Date.now() - t0 });
      return { ...forModel, note: forModel.note ?? 'nothing was changed: apply to build it' };
    },
    close: () => child.close(),
  };
  return {
    ...hex,
    call,
    lookahead,
    async close() {
      await lookahead.close();
      await hex.close();
    },
  };
}
