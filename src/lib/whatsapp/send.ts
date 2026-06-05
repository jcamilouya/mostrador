export async function enviarMensaje(numero: string, texto: string): Promise<void> {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_API_TOKEN;
  if (!phoneId || !token) return;

  await fetch(`https://graph.facebook.com/v18.0/${phoneId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: numero,
      type: 'text',
      text: { body: texto, preview_url: false },
    }),
  });
}

export async function descargarImagenMeta(imageId: string): Promise<string> {
  const token = process.env.WHATSAPP_API_TOKEN!;

  const urlRes = await fetch(`https://graph.facebook.com/v18.0/${imageId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { url } = await urlRes.json() as { url: string };

  const imgRes = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const buffer = await imgRes.arrayBuffer();
  return Buffer.from(buffer).toString('base64');
}
