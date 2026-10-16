type WhatsAppStatus = {
  configured: boolean;
  missing: string[];
  templateName: string;
};

export function getWhatsAppStatus(): WhatsAppStatus {
  const required = {
    WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
    WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
    WHATSAPP_TEMPLATE_NAME: process.env.WHATSAPP_TEMPLATE_NAME,
    WHATSAPP_GRAPH_API_VERSION: process.env.WHATSAPP_GRAPH_API_VERSION,
  };
  const missing = Object.entries(required).filter(([, value]) => !value).map(([key]) => key);
  return { configured: missing.length === 0, missing, templateName: required.WHATSAPP_TEMPLATE_NAME || '' };
}

export async function sendWhatsAppResult(phone: string, resultUrl: string) {
  const status = getWhatsAppStatus();
  if (!status.configured) throw new Error('WhatsApp Cloud API is not configured.');
  const version = process.env.WHATSAPP_GRAPH_API_VERSION!;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const response = await fetch(`https://graph.facebook.com/${version}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: `91${phone}`,
      type: 'template',
      template: {
        name: status.templateName,
        language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || 'en' },
        components: [{ type: 'body', parameters: [{ type: 'text', text: resultUrl }] }],
      },
    }),
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`WhatsApp delivery failed (${response.status}): ${detail.slice(0, 180)}`);
  }
}
