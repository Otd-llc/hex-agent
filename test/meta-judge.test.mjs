import { test } from 'node:test';
import assert from 'node:assert/strict';
import { metaJudge } from '../bin/meta-judge.mjs';
import { critique } from '../src/critic.mjs';

test('metaJudge sends input_image parts, question last, and reads the answer', async () => {
  let sent;
  const fetchImpl = async (url, opts) => {
    sent = { url, body: JSON.parse(opts.body) };
    const reply = { id: 'r1', model: 'muse-spark-1.3', output: [{ type: 'message', content: [{ type: 'output_text', text: 'No. The mug floats above the cover.' }] }], usage: { input_tokens: 3000, output_tokens: 20, input_tokens_details: { cached_tokens: 2000 } } };
    return { ok: true, status: 200, text: async () => JSON.stringify(reply) };
  };
  const usages = [];
  const judge = metaJudge({ apiKey: 'k', fetchImpl, readImage: () => 'AAAA', onUsage: (u) => usages.push(u) });
  const sheet = { name: 'b1', complete: true, missing: [], views: { threeQuarter: 'a.png', opposite: 'b.png' } };
  const r = await critique(sheet, judge, { questions: [{ id: 'rests', ask: 'Does it rest?' }] });
  assert.equal(r.answers.rests.answer, 'no');
  assert.match(sent.url, /\/responses$/);
  const content = sent.body.input[0].content;
  assert.deepEqual(content.map((c) => c.type), ['input_text', 'input_image', 'input_text', 'input_image', 'input_text']);
  assert.equal(content[1].image_url, 'data:image/png;base64,AAAA');
  assert.match(content.at(-1).text, /Does it rest\?/);
  assert.equal(sent.body.tools, undefined);
  assert.equal(usages[0].cachedInputTokens, 2000);
});

test('metaJudge throws on a non-ok reply with the status', async () => {
  const fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'boom' });
  const judge = metaJudge({ apiKey: 'k', fetchImpl, readImage: () => 'A' });
  await assert.rejects(judge({ name: 'b', question: 'q', images: [] }), (e) => e.status === 500);
});
