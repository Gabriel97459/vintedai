exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  const GEMINI_KEY = process.env.GEMINI_KEY;
  if (!GEMINI_KEY) return { statusCode: 500, body: JSON.stringify({ error: 'GEMINI_KEY not configured' }) };

  try {
    const { messages, system, max, vision } = JSON.parse(event.body);
    const model = 'gemini-2.0-flash';

    const contents = messages.map(m => {
      if (vision && Array.isArray(m.content)) {
        return { role: 'user', parts: m.content.map(p => {
          if (p.type === 'image_url') {
            const b64 = p.image_url.url.includes(',') ? p.image_url.url.split(',')[1] : p.image_url.url;
            return { inlineData: { mimeType: 'image/jpeg', data: b64 } };
          }
          return { text: p.text || '' };
        })};
      }
      return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content || '') }] };
    });

    const body = {
      system_instruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { maxOutputTokens: max || 1200 }
    };

    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!r.ok) {
      const err = await r.text();
      return { statusCode: r.status, body: err };
    }

    const data = await r.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ text })
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
