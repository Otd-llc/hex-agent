// CHANGED PARTS (HEX_PART_SERVICE, unset by default): the tool make_part, which asks a part
// service for a bolt bin changed (a recipe, hex-part-recipe/1) and returns its answer.
//   HEX_PART_SERVICE  the service's base URL (http://127.0.0.1:<port>); HEX_URL still names the page
// The service judges a recipe before it builds anything and answers its verdict: "clear" is
// built (or read where it was built before), anything else is refused with a fixed word and
// the field it is about. This file posts the recipe and returns that answer as it came: the
// word, the field and what the service adds (verdict, keep_out, read, name). It never asks
// again: a busy service (503, one build at a time) is a refusal "busy, retry after N s", and
// the model may ask later.
// No Origin header is sent: the service takes a request without one as a caller that is not
// a browser. The part made is kept by the service; it cannot yet be placed in a build (the
// page's ops carry no recipe), and the tool's answer says so.
// Unset, nothing here is offered: tools.mjs adds the spec and the handler, and agent.mjs the
// one line of the system text, only when the variable is set.
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createHash } from 'node:crypto';

export const RECIPE_SCHEMA = 'hex-part-recipe/1';

// A build at M was seen to take 4 min 46 s on the service's own machine; past six minutes
// the tool stops waiting and says so.
export const WAIT_MS = 360_000;

export const partService = () => process.env.HEX_PART_SERVICE || null;

export const PART_TOOL_LINE =
  '\n\nmake_part asks a part service for a bolt bin changed (a pocket, a divider, a port, a drain or a shape) at size S, M or L, and answers whether the change is clear; the part it makes cannot be placed in this build yet, so name it in your finish.';

export const MAKE_PART_SPEC = {
  name: 'make_part',
  description:
    'Ask the part service for a bolt bin changed: a base (a bolt bin id, hex-bin-bolt-...), a size of the system (S, M or L) and up to 8 changes, ' +
    "each added after the base's own features. The changes: " +
    '{"kind":"pocket","outline":"circle","centre_mm":[x,y],"radius_mm":r,"depth_mm":d} or ' +
    '{"kind":"pocket","outline":"rectangle","centre_mm":[x,y],"width_mm":w,"length_mm":l,"turn_deg":a,"depth_mm":d} (a blind pocket into the floor); ' +
    "{\"kind\":\"divider\",\"share\":s} (a rib across the tray at a share, 0 to 1, of the cavity's span); " +
    '{"kind":"port","u_mm":u,"z_mm":z,"radius_mm":r} (a teardrop port through the back, u across it, z up it); ' +
    "{\"kind\":\"drain\",\"pattern\":\"hexagons\"|\"pills\"|\"radial\"} (the family's drain, on a base that has none); " +
    '{"kind":"shape","make":"pad","height_mm":h,"points_mm":[[x,y],...]} or {"kind":"shape","make":"pocket","depth_mm":d,"points_mm":[[x,y],...]} ' +
    '(a pad on the floor or a pocket into it, a polygon of at most 32 points). Plan coordinates are mm in the part\'s own frame at its size. ' +
    'The service judges the recipe before it builds: a clear one is built (at M or L that can take minutes) and answered with name, verdict, notes and came (built or read). ' +
    'Otherwise it is refused with a word and the field: reaches (a change comes within its margin of what it must keep clear of, named in keep_out), ' +
    'scope (not a bolt bin), malformed (the recipe does not read; read says why), or a rule\'s own word. busy means a build is running: the tool does not ask again. ' +
    'The part is made and kept by the service; it cannot be placed in this build yet.',
  parameters: {
    type: 'object',
    properties: {
      base: { type: 'string', description: 'The bolt bin to change, by its catalogue id.' },
      size: { type: 'string', enum: ['S', 'M', 'L'], description: 'The size of the system: S is the standard; M and L are larger.' },
      changes: { type: 'array', items: { type: 'object' }, maxItems: 8, description: 'The changes, in the order they are made (see the description).' },
    },
    required: ['base', 'size', 'changes'],
    additionalProperties: false,
  },
};

/** The recipe make_part posts, and its canonical text (members in the schema's order). */
export function recipeOf({ base, size, changes }) {
  if (typeof changes === 'string') {
    try {
      changes = JSON.parse(changes);
    } catch {
      throw new Error('changes is to be an array of change objects');
    }
  }
  const recipe = { schema: RECIPE_SCHEMA, base, size, changes };
  return { recipe, text: JSON.stringify(recipe) };
}

// One POST, never retried. Resolves with the status, the headers and the body's text.
function post(url, body, waitMs) {
  return new Promise((resolve, reject) => {
    const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
    const req = send(
      url,
      {
        method: 'POST',
        agent: false,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), accept: 'application/json' },
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, text: Buffer.concat(chunks).toString('utf8') }));
        res.on('error', reject);
      },
    );
    req.setTimeout(waitMs, () => req.destroy(Object.assign(new Error('no answer in time'), { code: 'WAIT' })));
    req.on('error', reject);
    req.end(body);
  });
}

const NOT_PLACED = 'made and kept by the part service; it cannot be placed in this build yet';

/** make_part: the service's answer, as it came. `service` is the base URL (HEX_PART_SERVICE). */
export async function makePart(args, { service = partService(), onEvent = () => {}, waitMs = WAIT_MS } = {}) {
  if (!service) throw new Error('no part service: HEX_PART_SERVICE is not set');
  if (args === null || typeof args !== 'object' || Array.isArray(args)) throw new Error('make_part takes {base, size, changes}');
  const extra = Object.keys(args).filter((k) => !['base', 'size', 'changes'].includes(k));
  if (extra.length) throw new Error(`make_part takes base, size and changes, not ${extra.join(', ')}`);
  const { recipe, text } = recipeOf(args);
  const root = new URL(service.endsWith('/') ? service : service + '/');
  if (root.protocol !== 'http:' && root.protocol !== 'https:') throw new Error('HEX_PART_SERVICE is to be an http(s) URL');
  const url = new URL('v1/part', root);
  const t0 = Date.now();
  let answer;
  let status = null;
  try {
    const res = await post(url, text, waitMs);
    status = res.status;
    let body = null;
    try {
      body = JSON.parse(res.text);
    } catch {
      body = null;
    }
    if (status === 200 && body && typeof body === 'object') {
      answer = { ok: true, name: body.name, verdict: body.verdict, notes: body.notes ?? [], came: body.came, note: NOT_PLACED };
    } else if (status === 503) {
      const after = Number.parseInt(res.headers['retry-after'] ?? '', 10);
      const wait = Number.isFinite(after) ? `retry after ${after} s` : 'retry later';
      answer = { ok: false, status, refused: body?.refused ?? 'busy', field: body?.field ?? null, ...(Number.isFinite(after) ? { retryAfterS: after } : {}), note: `busy, ${wait}` };
    } else if (body && typeof body === 'object' && typeof body.refused === 'string') {
      answer = { ok: false, status, ...body };
    } else {
      answer = { ok: false, status, refused: 'unreadable', field: null, note: 'the service answered something that is not its JSON' };
    }
  } catch (e) {
    answer = { ok: false, status: null, refused: e.code === 'WAIT' ? 'no-answer' : 'unreachable', field: null, note: e.code === 'WAIT' ? `no answer within ${Math.round(waitMs / 1000)} s` : `the service could not be reached (${e.code ?? 'error'})` };
  }
  onEvent({ type: 'make_part', recipe, name: createHash('sha256').update(text).digest('hex'), status, answer, ms: Date.now() - t0 });
  return answer;
}
