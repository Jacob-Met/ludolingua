// Minimal OpenAI-compatible client for Nebius Token Factory. Server-side only: the key never reaches the browser.
export const NEBIUS_BASE_URL = 'https://api.tokenfactory.nebius.com/v1';
export const NEMOTRON_MODELS = [
  { id: 'nvidia/nemotron-3-super-120b-a12b', label: 'Nemotron 3 Super 120B-A12B (default)' },
  { id: 'nvidia/NVIDIA-Nemotron-3-Nano-30B-A3B', label: 'Nemotron 3 Nano 30B-A3B (fast)' },
  { id: 'nvidia/Nemotron-3-Ultra-550b-a55b', label: 'Nemotron 3 Ultra 550B-A55B (largest)' }
];
export const DEFAULT_MODEL = NEMOTRON_MODELS[0].id;

export class ModelUnavailable extends Error {}

export async function nebiusChat({ messages, model = DEFAULT_MODEL, apiKey = process.env.NEBIUS_API_KEY, baseUrl = NEBIUS_BASE_URL, fetchImpl = fetch, maxTokens = 4000, timeoutMs = 120_000 }) {
  if (!apiKey || !apiKey.trim()) throw new ModelUnavailable('NEBIUS_API_KEY is not set. Start the server with the key in the environment to use Nemotron.');
  if (!NEMOTRON_MODELS.some(m => m.id === model)) throw new ModelUnavailable('Unsupported model: ' + model);
  const response = await fetchImpl(baseUrl.replace(/\/$/, '') + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey.trim() },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature: 0.6 }),
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const detail = (await response.text().catch(() => '')).slice(0, 200).replaceAll(apiKey.trim(), '[redacted]');
    throw new Error(`Token Factory returned HTTP ${response.status}. ${detail}`.trim());
  }
  const body = await response.json();
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new Error('Token Factory returned no message content (the model may have run out of tokens while reasoning).');
  return { content, model: body.model ?? model, usage: body.usage ?? null };
}
