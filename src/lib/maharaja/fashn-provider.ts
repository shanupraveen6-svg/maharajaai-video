/**
 * FASHN virtual try-on (tryon-v1.6), one of the Try-On image engines. Used only when FASHN_API_KEY is set.
 * The job is submitted, then its status is polled until the image is ready; the image comes back as
 * base64, so nothing is fetched from another host. FASHN does not bill failed predictions.
 */
const FASHN_API = 'https://api.fashn.ai/v1';
const POLL_INTERVAL_MS = 1500;
const MAX_RESULT_BYTES = 16 * 1024 * 1024;

export function buildFashnInput(personBase64: string, garmentBase64: string) {
  return {
    model_name: 'tryon-v1.6',
    inputs: {
      model_image: `data:image/jpeg;base64,${personBase64}`,
      garment_image: `data:image/jpeg;base64,${garmentBase64}`,
      category: 'auto',
      garment_photo_type: 'auto',
      mode: 'balanced',
      moderation_level: 'permissive',
      num_samples: 1,
      output_format: 'jpeg',
      return_base64: true,
    },
  };
}

function decodeOutput(output: unknown) {
  const value = Array.isArray(output) ? output[0] : output;
  if (typeof value !== 'string') throw new Error('FASHN Try-On returned no image.');
  const base64 = value.startsWith('data:') ? value.slice(value.indexOf(',') + 1) : value;
  const buffer = Buffer.from(base64, 'base64');
  if (!buffer.length || buffer.length > MAX_RESULT_BYTES) throw new Error('FASHN Try-On returned an invalid image.');
  return buffer;
}

export async function generateFashnTryOn(personBase64: string, garmentBase64: string, key: string, { timeoutMs = 60_000 } = {}): Promise<Buffer> {
  const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Accept: 'application/json' };
  const submit = await fetch(`${FASHN_API}/run`, {
    method: 'POST',
    headers,
    body: JSON.stringify(buildFashnInput(personBase64, garmentBase64)),
    signal: AbortSignal.timeout(20_000),
    cache: 'no-store',
  });
  const submitted = await submit.json().catch(() => null);
  if (!submit.ok || typeof submitted?.id !== 'string') {
    throw new Error(`FASHN Try-On was not accepted (${submit.status}${submitted?.error ? `: ${String(submitted.error).slice(0, 80)}` : ''}).`);
  }
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    const response = await fetch(`${FASHN_API}/status/${encodeURIComponent(submitted.id)}`, { headers, signal: AbortSignal.timeout(10_000), cache: 'no-store' });
    const status = await response.json().catch(() => null);
    if (!response.ok) continue;
    if (status?.status === 'completed') return decodeOutput(status.output);
    if (['failed', 'canceled', 'time_out'].includes(status?.status)) {
      throw new Error(`FASHN Try-On ${status.status}${status?.error?.message ? `: ${String(status.error.message).slice(0, 120)}` : ''}.`);
    }
  }
  throw new Error('FASHN Try-On did not finish in time.');
}
