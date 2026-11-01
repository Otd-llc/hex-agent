// Up windows of the Modal Dedicated Endpoint, which bills GPU seconds while up.
//   node bin/modal-session.mjs start --host=<x.modal.run> --up-at=<ISO with zone, when it was started>
//        --max-replicas=1 [--gpus=4] [--config-shot=<path to the endpoint settings screenshot>]
//   node bin/modal-session.mjs stop [--down-at=<ISO with zone>]
//   node bin/modal-session.mjs reconcile --billed-usd=<from the Modal usage page> --source=<where it was read>
//   node bin/modal-session.mjs status
// Record start when the owner starts the endpoint (back-dated with --up-at: the cold
// start bills), stop once it is deleted, reconcile once the usage page shows the bill.
// The host is pinned at start: runs send the proxy token to that host only.
import { loadEnv } from '../src/env.mjs';
import { openUptimeLedger, B300_USD_PER_S, DEDICATED_GPUS } from '../src/uptime.mjs';
import { dedicatedHost } from '../src/hosted.mjs';

loadEnv();
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;
const credit = Number(process.env.MODAL_CREDIT_USD);
if (!(credit > 0)) {
  console.error('set MODAL_CREDIT_USD (the Modal plan credit in USD) and MODAL_RESERVE_USD');
  process.exit(2);
}
const ledger = openUptimeLedger({ creditUsd: credit, reserveUsd: Number(process.env.MODAL_RESERVE_USD ?? 0) });

try {
  if (cmd === 'start') {
    if (!flag('up-at')) throw new Error('start needs --up-at (when the owner started the endpoint, with its zone): the cold start bills');
    if (flag('max-replicas') == null) throw new Error('start needs --max-replicas (the endpoint setting; must be 1)');
    const s = ledger.start({
      host: dedicatedHost(`modal-dedicated:${flag('host') ?? ''}`),
      gpus: Number(flag('gpus') ?? DEDICATED_GPUS),
      usdPerGpuS: B300_USD_PER_S,
      maxReplicas: Number(flag('max-replicas')),
      upAt: flag('up-at'),
      configShot: flag('config-shot'),
    });
    console.log(JSON.stringify(s));
    console.log(`billing about $${s.up.usdPerHour}/hour while up; ${s.up.minutesToCap} min to the cap. Stop it with: node bin/modal-session.mjs stop`);
  } else if (cmd === 'stop') {
    console.log(JSON.stringify(ledger.stop({ downAt: flag('down-at') })));
  } else if (cmd === 'reconcile') {
    console.log(JSON.stringify(ledger.reconcile({ billedUsd: Number(flag('billed-usd')), source: flag('source') })));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(ledger.summary()));
  } else {
    console.error('usage: node bin/modal-session.mjs start --host=<h> --up-at=<ISO+zone> --max-replicas=1 | stop [--down-at=<ISO+zone>] | reconcile --billed-usd=<n> --source=<s> | status');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
