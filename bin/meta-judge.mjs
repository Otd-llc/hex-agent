// A judge on a Meta Muse model for the A56 critic: the same sheet, the same one
// question, the same "yes" or "no" and one sentence as claudeJudge in src/critic.mjs,
// sent to the Meta Responses API as input_image parts (dev.meta.ai/docs/image-understanding).
// It lives in bin/, not src/, so the frozen agent (tag eval-final) is untouched.
import { readFileSync } from 'node:fs';
import { META_BASE, parseResponse } from '../src/model.mjs';
import { timedPost } from '../src/http.mjs';

export function metaJudge({
  model = 'muse-spark-1.3',
  apiKey = process.env.MODEL_API_KEY,
  effort = 'low',
  timeoutMs = 120_000,
  fetchImpl = fetch,
  readImage = (p) => readFileSync(p).toString('base64'),
  onUsage = () => {},
}) {
  if (!apiKey) throw new Error('MODEL_API_KEY is not set (see .env.example)');
  return async ({ name, question, images }) => {
    // Images first and the question last, so the four questions on one sheet share a cached prefix.
    const content = [];
    for (const im of images) {
      content.push({ type: 'input_text', text: `${im.view} view:` });
      content.push({ type: 'input_image', image_url: `data:image/png;base64,${readImage(im.path)}` });
    }
    content.push({ type: 'input_text', text: `These are still views of one modular build (${name}). ${question}\nAnswer "yes" or "no", then one sentence saying what you see.` });
    const body = {
      model,
      input: [{ role: 'user', content }],
      reasoning: { effort },
      prompt_cache_key: `hex-critic-${name}`,
    };
    const { res, raw, http } = await timedPost(fetchImpl, `${META_BASE}/responses`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body,
      timeoutMs,
    });
    if (!res.ok) throw Object.assign(new Error(`Meta API ${res.status}: ${raw.slice(0, 500)}`), { status: res.status, http });
    const r = parseResponse(JSON.parse(raw));
    onUsage(r.usage, { servedBy: r.servedBy, http });
    const text = r.text || '[no answer: empty output]';
    return { text };
  };
}
