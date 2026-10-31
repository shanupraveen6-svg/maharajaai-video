/**
 * TryFocus support notifications by email, sent through Resend's HTTP API (no SDK needed).
 * Needs RESEND_API_KEY; without it the message is only logged so the request itself never fails.
 */
export const SUPPORT_EMAIL = process.env.TRYFOCUS_SUPPORT_EMAIL || 'shanupraveen6@gmail.com';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

export async function sendSupportEmail(subject: string, lines: string[]): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn(`[support-email] RESEND_API_KEY not set; not emailed to ${SUPPORT_EMAIL}: ${subject}`);
    return false;
  }
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.TRYFOCUS_EMAIL_FROM || 'TryFocus <onboarding@resend.dev>',
        to: [SUPPORT_EMAIL],
        subject,
        text: lines.join('\n'),
        html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(''),
      }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      console.error(`[support-email] Resend ${response.status}: ${await response.text().catch(() => '')}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[support-email] send failed', error);
    return false;
  }
}
