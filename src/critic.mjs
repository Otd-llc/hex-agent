// A56: an offline vision critic over still sheets on disk. A sheet is one build
// seen three ways (three-quarter from where the user stands or sits, the
// opposite three-quarter, top); the critic answers three yes/no questions about
// it. It is calibrated against the owner's premades verdicts before it is
// trusted, and it never outvotes a numeric predicate: where code measured the
// same thing (a mesh clash, a floating prop), code decides.
//
// The judge is injected: a vision model (claudeJudge) or a fake in tests.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Each view and the file it is, next to the build's own name: <name>.png, <name>-back.png, <name>-top.png.
export const VIEWS = { threeQuarter: '', opposite: '-back', top: '-top' };

// yes is good on every question. covers: the predicates that, together, measure
// all of what the question asks; a question code only partly measures covers none.
// Scale and floating absurdity is two questions: resting is measured, pose is not.
export const QUESTIONS = [
  {
    id: 'purpose',
    ask: 'Within two seconds of looking, can you tell what this build is for (what it holds or does, for whom)? A bare structure, or one whose props are too few or hidden to say, is no.',
    covers: [],
  },
  {
    id: 'rests',
    ask: 'Does every object rest on something, with nothing floating in the air and nothing sunk into a part or another object?',
    covers: ['propFloating', 'propInside'],
  },
  {
    id: 'pose',
    ask: 'Is everything at a believable scale and sitting the way a real object would (not on its side, upside down, balanced on a point, or overhanging an edge)?',
    covers: [],
  },
  {
    id: 'workZone',
    ask: 'Is the place where the user works or reaches readable and clear: you can see where the hands go, and nothing stands in it?',
    covers: [],
  },
];

export function sheetFor(name, dir, { views = Object.keys(VIEWS), exists = existsSync } = {}) {
  const paths = {};
  for (const v of views) {
    const p = join(dir, `${name}${VIEWS[v]}.png`);
    paths[v] = exists(p) ? p : null;
  }
  const missing = views.filter((v) => !paths[v]);
  return { name, views: paths, missing, complete: !missing.length };
}

// Build names from still file names: <name>-back.png and <name>-top.png are views of
// <name> only when <name>.png is there too, so a build named "...-back" keeps its name.
export function buildNames(files) {
  const stems = new Set(files.filter((f) => f.endsWith('.png')).map((f) => f.slice(0, -4)));
  const view = (s) => Object.values(VIEWS).some((suf) => suf && s.endsWith(suf) && stems.has(s.slice(0, -suf.length)));
  return [...stems].filter((s) => !view(s)).sort();
}

// "yes", "No.", "**yes** - because" -> 'yes' | 'no'; anything else is null.
export function parseAnswer(text) {
  const m = String(text ?? '').trim().replace(/^[*_`"']+/, '').match(/^(yes|no)\b/i);
  return m ? m[1].toLowerCase() : null;
}

// Ask every question of one sheet. judge({ name, question, images }) -> { answer, why }.
// An incomplete sheet is not judged: a missing view could hide what a question asks.
export async function critique(sheet, judge, { questions = QUESTIONS } = {}) {
  if (!sheet.complete) return { name: sheet.name, complete: false, missing: sheet.missing, answers: {} };
  const images = Object.entries(sheet.views).map(([view, path]) => ({ view, path }));
  const answers = {};
  for (const q of questions) {
    const r = await judge({ name: sheet.name, question: q.ask, images });
    const answer = r?.answer === 'yes' || r?.answer === 'no' ? r.answer : parseAnswer(r?.text);
    answers[q.id] = { answer, why: r?.why ?? r?.text ?? null };
  }
  return { name: sheet.name, complete: true, missing: [], answers };
}

// The verdict. A failing predicate fails the build whatever the critic says; a
// critic no on a question whose covering predicates all ran and passed is
// overruled; any other no is a "review" (a person looks), never a fail.
export function combine(critic, predicates = [], { questions = QUESTIONS } = {}) {
  const failed = predicates.filter((p) => !p.ok).map((p) => p.id);
  const passed = new Set(predicates.filter((p) => p.ok).map((p) => p.id));
  const noes = Object.entries(critic?.answers ?? {}).filter(([, a]) => a.answer === 'no').map(([id]) => id);
  const covered = (id) => {
    const covers = questions.find((q) => q.id === id)?.covers ?? [];
    return covers.length > 0 && covers.every((c) => passed.has(c));
  };
  const overruled = noes.filter(covered);
  const flags = noes.filter((id) => !covered(id));
  const unanswered = Object.entries(critic?.answers ?? {}).filter(([, a]) => a.answer == null).map(([id]) => id);
  if (failed.length) return { verdict: 'fail', failed, flags, overruled };
  if (flags.length || unanswered.length || !critic?.complete) return { verdict: 'review', failed, flags, overruled, ...(unanswered.length ? { unanswered } : {}), ...(critic?.complete ? {} : { incomplete: critic?.missing ?? [] }) };
  return { verdict: 'pass', failed, flags, overruled };
}

// The owner's verdicts: round 1 as markdown (only Drop and Fix are listed),
// round 2 as the picks JSON (every build, yes or fix). name -> { verdict, note, chips, round }.
export function ownerVerdicts({ round1 = null, round2 = null } = {}) {
  const out = { round1: new Map(), round2: new Map() };
  if (round1) {
    let section = null;
    for (const line of round1.split(/\r?\n/)) {
      const h = line.match(/^##\s+(\w+)/);
      if (h) {
        section = /drop/i.test(h[1]) ? 'drop' : /fix/i.test(h[1]) ? 'fix' : null;
        continue;
      }
      if (!section || !line.trim()) continue;
      // "- name: "note"" or "- label: a/-b/-c, d (note)" or bare names.
      const bullet = line.match(/^\s*-\s*([^:]+):\s*(.*)$/);
      const note = bullet ? bullet[2].replace(/^"|"$/g, '') : null;
      const names = bullet ? (isName(bullet[1].trim()) ? [bullet[1].trim()] : expandNames(bullet[2])) : expandNames(line);
      for (const n of names) out.round1.set(n, { verdict: section, note: note ?? (bullet ? bullet[1].trim() : null), chips: [], round: 1 });
    }
  }
  if (round2) {
    for (const [name, p] of Object.entries(round2.picks ?? {})) {
      const verdict = p.v === 'yes' ? 'keep' : p.v === 'fix' ? 'fix' : 'drop';
      out.round2.set(name, { verdict, note: p.note ?? null, chips: p.chips ?? [], round: 2 });
    }
  }
  return out;
}

const isName = (s) => /^[a-z0-9]+(-[a-z0-9]+)+$/.test(s);
// "storage-tower-corner/-slim/-spice (driver stand on floor), field-mast-tower" -> four names.
function expandNames(text) {
  const out = [];
  for (const tok of text.replace(/\([^)]*\)/g, ' ').split(/[\s,]+/).filter(Boolean)) {
    const [first, ...rest] = tok.split('/');
    if (!isName(first)) continue;
    out.push(first);
    const stem = first.split('-').slice(0, -1).join('-');
    for (const r of rest) if (/^-[a-z0-9-]+$/.test(r)) out.push(stem + r);
  }
  return out;
}

// Which questions an owner's fix note implicates; gate failures belong to the predicates, not the critic.
const IMPLICATES = [
  { id: 'rests', note: /float|sunk|inside/i, chips: [] },
  { id: 'pose', note: /on its side|upside down|standing (straight )?up|by itself|overhang|on (the )?floor/i, chips: ['wrong_end'] },
  { id: 'purpose', note: /not enough props|underdressed|empty|no (magazines|shoes)|plant it out|generic|raise the height/i, chips: ['legal_but_generic', 'invisible_in_bin', 'taste_only'] },
  { id: 'workZone', note: /work zone|in the way|blocks|reach/i, chips: [] },
];
export function implicated(v) {
  return IMPLICATES.filter((i) => i.note.test(v.note ?? '') || (v.chips ?? []).some((c) => i.chips.includes(c))).map((i) => i.id);
}

// How the critic lines up with the owner: a flag (any no, overruled or not) against
// fix or drop, per build and per question. Builds the owner did not judge are left out.
// A round that lists no keeps (round 1) measures recall only: agreement is null there,
// since a critic that says no to everything would score 100%. The verdicts must be on
// the same stills the critic sees: a build fixed after the review is a different build.
export function calibrate(results, verdicts) {
  const m = { n: 0, agree: 0, fixFlagged: 0, fixMissed: 0, keepFlagged: 0, keepPassed: 0, incomplete: 0 };
  const perQuestion = Object.fromEntries(QUESTIONS.map((q) => [q.id, { implicated: 0, caught: 0, noOnKeep: 0 }]));
  const disagreements = [];
  for (const r of results) {
    const v = verdicts.get(r.name);
    if (!v) continue;
    if (!r.complete) {
      m.incomplete++;
      continue;
    }
    m.n++;
    const noes = Object.entries(r.answers).filter(([, a]) => a.answer === 'no').map(([id]) => id);
    const bad = v.verdict !== 'keep';
    const flagged = noes.length > 0;
    if (bad && flagged) m.fixFlagged++;
    if (bad && !flagged) m.fixMissed++;
    if (!bad && flagged) m.keepFlagged++;
    if (!bad && !flagged) m.keepPassed++;
    if (bad === flagged) m.agree++;
    else disagreements.push({ name: r.name, owner: v.verdict, note: v.note, critic: noes });
    for (const id of bad ? implicated(v) : []) {
      perQuestion[id].implicated++;
      if (noes.includes(id)) perQuestion[id].caught++;
    }
    if (!bad) for (const id of noes) perQuestion[id].noOnKeep++;
  }
  const recallOnly = ![...verdicts.values()].some((v) => v.verdict === 'keep');
  const bad = m.fixFlagged + m.fixMissed;
  return { ...m, recallOnly, agreement: m.n && !recallOnly ? m.agree / m.n : null, recall: bad ? m.fixFlagged / bad : null, perQuestion, disagreements };
}

// A judge on a Claude vision model: the sheet's images and one question, answered
// "yes" or "no" and one sentence. client is an Anthropic SDK client.
export function claudeJudge({ client, model = 'claude-haiku-5-5', readImage = (p) => readFileSync(p).toString('base64'), onUsage = () => {} }) {
  return async ({ name, question, images }) => {
    const content = [];
    for (const im of images) {
      content.push({ type: 'text', text: `${im.view} view:` });
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: readImage(im.path) } });
    }
    content.push({ type: 'text', text: `These are still views of one modular build (${name}). ${question}\nAnswer "yes" or "no", then one sentence saying what you see.` });
    // Room for the model's own thinking before the answer: 200 tokens left most replies empty (Haiku 5.5, 2026-10-31).
    const res = await client.messages.create({ model, max_tokens: 2048, output_config: { effort: 'low' }, messages: [{ role: 'user', content }] });
    onUsage(res.usage);
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || `[no answer: stop ${res.stop_reason}]`;
    return { answer: parseAnswer(text), text };
  };
}
