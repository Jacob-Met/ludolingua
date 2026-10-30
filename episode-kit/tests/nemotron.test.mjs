import test from 'node:test';
import assert from 'node:assert/strict';
import { EPISODES } from '../fixtures/episodes.mjs';
import { nebiusChat, ModelUnavailable } from '../lib/nebius.mjs';
import { adaptWithNemotron, extractJson, buildMessages } from '../lib/nemotron-adapt.mjs';
import { startReceiver } from '../serve.mjs';

const source = EPISODES.find(e => e.id === 'en-original');
const good = { action: 'ABRE', labels: { key: 'Arco', bell: 'Bosque', moon: 'Río', star: 'Estrella' }, title: 'El archivo', story: 'Ordena las tarjetas.', hints: ['Uno', 'Dos', 'Tres'] };
const bad = { action: 'ABRE', labels: { key: 'Nutria', bell: 'Pino', moon: 'Águila', star: 'Nido' } };
const scripted = replies => { const calls = []; const chat = async messages => { calls.push(messages); return { content: replies[Math.min(calls.length - 1, replies.length - 1)], model: 'fake', usage: { prompt_tokens: 1, completion_tokens: 2 } }; }; chat.calls = calls; return chat; };

test('extractJson tolerates fences and surrounding prose', () => {
  assert.deepEqual(extractJson('Here:\n```json\n{"a":1}\n```\nthanks'), { a: 1 });
  assert.throws(() => extractJson('no json'), /JSON/);
});
test('prompt states solved order and the first-letter rule', () => {
  const text = buildMessages(source, 'es').map(m => m.content).join('\n');
  assert.match(text, /slot 1: role "key"/); assert.match(text, /FIRST LETTER/);
});
test('a proposal that satisfies the engine is accepted and verified independently', async () => {
  const r = await adaptWithNemotron({ source, targetLocale: 'es', chat: scripted([JSON.stringify(good)]) });
  assert.equal(r.ok, true); assert.equal(r.attempts.length, 1);
  assert.equal(r.comparison.mechanicalPreserved, true); assert.equal(r.analysis.outcome, 'verified');
  assert.equal(r.episode.locale, 'es'); assert.equal(r.episode.provenance.modelRun, null);
});
test('literal translations are rejected with feedback and the retry can succeed', async () => {
  const chat = scripted([JSON.stringify(bad), JSON.stringify(good)]);
  const r = await adaptWithNemotron({ source, targetLocale: 'es', chat });
  assert.equal(r.ok, true); assert.equal(r.attempts.length, 2); assert.equal(r.attempts[0].ok, false);
  assert.match(r.attempts[0].reasons.join(' '), /NPÁN/);
  assert.match(chat.calls[1].at(-1).content, /rejected by the puzzle checker/);
});
test('nothing is accepted when every attempt fails the checker', async () => {
  const r = await adaptWithNemotron({ source, targetLocale: 'es', chat: scripted([JSON.stringify(bad), 'garbage']), maxAttempts: 3 });
  assert.equal(r.ok, false); assert.equal(r.episode, null); assert.equal(r.attempts.length, 3);
});
test('a fixed action word of the wrong length cannot pass', async () => {
  const r = await adaptWithNemotron({ source, targetLocale: 'es', targetAction: 'CERRAR', chat: scripted([JSON.stringify({ ...good, action: 'CERRAR' })]), maxAttempts: 1 });
  assert.equal(r.ok, false);
});
test('client refuses without a key and never leaks one in errors', async () => {
  await assert.rejects(nebiusChat({ messages: [], apiKey: '' }), ModelUnavailable);
  const fetchImpl = async () => new Response('bad key sk-secret-123', { status: 401 });
  await assert.rejects(nebiusChat({ messages: [], apiKey: 'sk-secret-123', fetchImpl }), e => !e.message.includes('sk-secret-123') && /401/.test(e.message));
});
test('client sends an OpenAI-compatible request to Token Factory', async () => {
  let seen;
  const fetchImpl = async (url, init) => { seen = { url, init }; return Response.json({ model: 'm', choices: [{ message: { content: 'ok', reasoning_content: 'x' } }] }); };
  const r = await nebiusChat({ messages: [{ role: 'user', content: 'hi' }], apiKey: 'k', fetchImpl });
  assert.equal(r.content, 'ok'); assert.equal(seen.url, 'https://api.tokenfactory.nebius.com/v1/chat/completions');
  const body = JSON.parse(seen.init.body); assert.ok(body.max_tokens >= 1500); assert.match(body.model, /^nvidia\//);
});
test('server API: adapts with an injected model and reports 503 without a key', async () => {
  const withModel = await startReceiver({ chat: async () => ({ content: JSON.stringify(good), model: 'fake' }) });
  try {
    const res = await fetch(withModel.url + '/api/adapt', { method: 'POST', body: JSON.stringify({ sourceId: 'en-original', targetLocale: 'es' }) });
    const body = await res.json(); assert.equal(res.status, 200); assert.equal(body.ok, true);
    const unknown = await fetch(withModel.url + '/api/adapt', { method: 'POST', body: JSON.stringify({ sourceId: 'nope', targetLocale: 'es' }) });
    assert.equal(unknown.status, 400);
  } finally { withModel.server.close(); }
  const saved = process.env.NEBIUS_API_KEY; delete process.env.NEBIUS_API_KEY;
  const noKey = await startReceiver();
  try {
    const res = await fetch(noKey.url + '/api/adapt', { method: 'POST', body: JSON.stringify({ sourceId: 'en-original', targetLocale: 'es' }) });
    assert.equal(res.status, 503); assert.match((await res.json()).error, /NEBIUS_API_KEY/);
  } finally { noKey.server.close(); if (saved) process.env.NEBIUS_API_KEY = saved; }
});
