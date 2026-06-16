exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const GROQ_KEY = process.env.GROQ_KEY;
  if (!GROQ_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'GROQ_KEY not configured' }) };
  }

  try {
    const body = JSON.parse(event.body);
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + GROQ_KEY
      },
      body: JSON.stringify(body)
    });

    const data = await response.text();
    return {
      statusCode: response.status,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: data
    };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
  }
};
