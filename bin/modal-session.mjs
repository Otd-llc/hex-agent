// Up windows of the Modal Dedicated Endpoint, which bills GPU seconds while up.
//   node bin/modal-session.mjs start --host=<x.modal.run> --up-at=<ISO with zone, when it was started>
//        --max-replicas=1 --idle-min=15 [--config-shot=.spend/<screenshot of the endpoint settings>]
//   node bin/modal-session.mjs approve --segment=<name> --sets=briefs,briefs-hard,briefs-wide [--only=ids]
//        --repeat=N --concurrency=C [--max-minutes=M] --approved-by="<who OK'd it, where>"
//   node bin/modal-session.mjs stop [--down-at=<ISO with zone>]
//   node bin/modal-session.mjs reconcile --billed-usd=<from the Modal usage page> --source=<where it was read>
//   node bin/modal-session.mjs status
// Record start when the owner starts the endpoint (back-dated with --up-at: the cold
// start bills), approve each segment as the owner OKs it (the window runs only that
// spec), stop once it is deleted, reconcile once the usage page shows the bill.
// The host is pinned at start: runs send the proxy token to that host only.
// MODAL_CREDIT_USD / MODAL_RESERVE_USD may only tighten the $130 ceiling and $5 floor.
import { resolve, relative, isAbsolute } from 'node:path';
import { loadEnv } from '../src/env.mjs';
import { openUptimeLedger, DEDICATED_GPUS, CREDIT_CEILING_USD, RESERVE_FLOOR_USD } from '../src/uptime.mjs';
import { dedicatedHost, hostLabel } from '../src/hosted.mjs';
import { ROOT } from '../src/ledger.mjs';

loadEnv();
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;

try {
  const ledger = openUptimeLedger({ creditUsd: process.env.MODAL_CREDIT_USD ?? CREDIT_CEILING_USD, reserveUsd: process.env.MODAL_RESERVE_USD ?? RESERVE_FLOOR_USD });
  if (cmd === 'start') {
    if (!flag('up-at')) throw new Error('start needs --up-at (when the owner started the endpoint, with its zone): the cold start bills');
    if (flag('max-replicas') == null) throw new Error('start needs --max-replicas (the endpoint setting; must be 1)');
    if (flag('idle-min') == null) throw new Error('start needs --idle-min (the endpoint idle timeout; must be 15)');
    // The settings screenshot shows the host: it stays under .spend/ (gitignored).
    const shot = flag('config-shot');
    if (shot) {
      const rel = relative(resolve(ROOT, '.spend'), resolve(ROOT, shot));
      if (rel.startsWith('..') || isAbsolute(rel)) throw new Error('--config-shot must be a file under .spend/ (it shows the host; .spend/ is gitignored)');
    }
    const host = dedicatedHost(`modal-dedicated:${flag('host') ?? ''}`);
    const s = ledger.start({ host, gpus: Number(flag('gpus') ?? DEDICATED_GPUS), maxReplicas: Number(flag('max-replicas')), idleMin: Number(flag('idle-min')), upAt: flag('up-at'), configShot: shot });
    console.log(JSON.stringify(s));
    console.log(`window open for ${hostLabel(host)}: about $${s.up.usdPerHour}/hour while up; new work stops ${s.up.minutesToStop} min from now (the tail: last run + 15 min idle + delete). Stop it with: node bin/modal-session.mjs stop`);
  } else if (cmd === 'approve') {
    const a = ledger.approve({
      segment: flag('segment'),
      spec: { sets: String(flag('sets') ?? '').split(',').filter(Boolean), only: flag('only'), repeat: flag('repeat'), concurrency: flag('concurrency'), maxMinutes: flag('max-minutes'), effort: flag('effort') ?? 'low' },
      approvedBy: flag('approved-by'),
    });
    console.log(JSON.stringify(a));
  } else if (cmd === 'stop') {
    console.log(JSON.stringify(ledger.stop({ downAt: flag('down-at') })));
  } else if (cmd === 'reconcile') {
    console.log(JSON.stringify(ledger.reconcile({ billedUsd: Number(flag('billed-usd')), source: flag('source') })));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(ledger.summary()));
  } else {
    console.error('usage: node bin/modal-session.mjs start --host=<h> --up-at=<ISO+zone> --max-replicas=1 --idle-min=15 [--config-shot=.spend/...] | approve --segment=<n> --sets=... --repeat=N --concurrency=C [--only] [--max-minutes] --approved-by=<s> | stop [--down-at=<ISO+zone>] | reconcile --billed-usd=<n> --source=<s> | status');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
