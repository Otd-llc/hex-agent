// Up windows of the Modal Dedicated Endpoint, which bills GPU seconds while up.
//   node bin/modal-session.mjs start --host=<endpoint host> [--up-at=<ISO, when it was started: the cold start bills>] [--gpus=4]
//   node bin/modal-session.mjs stop [--down-at=<ISO>]
//   node bin/modal-session.mjs status
// Record start when the owner starts the endpoint (or back-date it with --up-at),
// and stop once it is scaled down. Runs refuse to start without an open window,
// or when the window, carried to the end of the longest run, would cross
// MODAL_CREDIT_USD less MODAL_RESERVE_USD.
import { loadEnv } from '../src/env.mjs';
import { openUptimeLedger, B300_USD_PER_S, DEDICATED_GPUS } from '../src/uptime.mjs';

loadEnv();
const [cmd, ...rest] = process.argv.slice(2);
const flag = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? null;
const credit = Number(process.env.MODAL_CREDIT_USD);
if (!(credit > 0)) {
  console.error('set MODAL_CREDIT_USD (the Modal plan credit in USD) and MODAL_RESERVE_USD');
  process.exit(2);
}
const ledger = openUptimeLedger({ creditUsd: credit, reserveUsd: Number(process.env.MODAL_RESERVE_USD ?? 0) });
const iso = (v, name) => {
  if (v == null) return null;
  if (Number.isNaN(Date.parse(v))) throw new Error(`--${name} must be an ISO time`);
  return new Date(v).toISOString();
};

try {
  if (cmd === 'start') {
    const s = ledger.start({ host: flag('host'), gpus: Number(flag('gpus') ?? DEDICATED_GPUS), usdPerGpuS: B300_USD_PER_S, upAt: iso(flag('up-at'), 'up-at') });
    console.log(JSON.stringify(s));
    console.log(`billing about $${s.up.usdPerHour}/hour while up; ${s.up.minutesToCap} min to the cap. Stop it with: node bin/modal-session.mjs stop`);
  } else if (cmd === 'stop') {
    console.log(JSON.stringify(ledger.stop({ downAt: iso(flag('down-at'), 'down-at') })));
  } else if (cmd === 'status') {
    console.log(JSON.stringify(ledger.summary()));
  } else {
    console.error('usage: node bin/modal-session.mjs start --host=<h> [--up-at=<ISO>] | stop [--down-at=<ISO>] | status');
    process.exit(2);
  }
} catch (e) {
  console.error(e.message);
  process.exit(1);
}
