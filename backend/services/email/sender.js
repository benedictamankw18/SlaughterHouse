const { renderTemplate } = require('./templates');

const RESEND_URL = 'https://api.resend.com/emails';

async function sendEmail({ to, template, data, idempotencyKey }, options = {}) {
  const apiKey = options.apiKey ?? process.env.EMAIL_API_KEY;
  const from = options.from ?? process.env.EMAIL_FROM;
  const fetchImpl = options.fetchImpl ?? global.fetch;
  if (!apiKey || !from) throw new Error('Email delivery is not configured.');
  if (typeof fetchImpl !== 'function') throw new Error('Email delivery requires fetch support.');

  const rendered = renderTemplate(template, data);
  let response;
  try {
    response = await fetchImpl(RESEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
      },
      body: JSON.stringify({ from, to: [to], ...rendered }),
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw new Error('Email provider request failed.');
  }
  if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  return true;
}

module.exports = { RESEND_URL, sendEmail };
