// Pilot-inquiry endpoint for the hub landing page. A plain form POST lands
// here; each qualified inquiry is forwarded as an email via Resend so it
// arrives in the martin@evalarium.ai inbox without a CRM or list provider.
// Requires RESEND_API_KEY in the Vercel project environment; sender and
// recipient are both martin@evalarium.ai (the Resend-verified domain).
// The production route is also protected by a Vercel WAF rate-limit rule.

const page = (title, body) => `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<body style="font-family: system-ui, sans-serif; background: #f2f2ed; color: #191919; display: grid; place-items: center; min-height: 100vh; margin: 0;">
<div style="text-align: center; padding: 24px;">
<h1 style="letter-spacing: -0.04em;">${title}</h1>
<p>${body}</p>
<p><a href="/" style="color: #335cff;">Back to evalarium.ai</a></p>
</div>
</body>`;

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).setHeader('allow', 'POST').send('Method not allowed');
    return;
  }
  const contentLength = Number(request.headers?.['content-length'] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > 12_000) {
    response
      .status(413)
      .send(page('That inquiry is too large', 'Email us instead.'));
    return;
  }
  const field = (name) =>
    typeof request.body?.[name] === 'string' ? request.body[name].trim() : '';
  const email =
    typeof request.body?.email === 'string' ? request.body.email.trim() : '';
  const company = field('company');
  const useCase = field('useCase');
  const website = field('website');

  // Bots commonly fill every field. Return the same success page without
  // sending anything so the trap does not teach them how to bypass it.
  if (website !== '') {
    response
      .status(200)
      .send(page('Inquiry received', 'We will get back to you shortly.'));
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) || email.length > 254) {
    response
      .status(400)
      .send(page('That address did not parse', 'Go back and try again.'));
    return;
  }
  if (
    company.length < 2 ||
    company.length > 100 ||
    useCase.length < 10 ||
    useCase.length > 1500
  ) {
    response
      .status(400)
      .send(
        page(
          'A little more context is needed',
          'Include your company and the browser workflow you want to evaluate.',
        ),
      );
    return;
  }
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    response
      .status(503)
      .send(
        page(
          'Signups are not wired up yet',
          'Email martin@evalarium.ai instead.',
        ),
      );
    return;
  }
  const resendResponse = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from: 'Martin at Evalarium <martin@evalarium.ai>',
      to: ['martin@evalarium.ai'],
      subject: `Evalarium pilot inquiry: ${email}`,
      text:
        `Email: ${email}\n` +
        `Company: ${company}\n\n` +
        `Browser workflow:\n${useCase}\n`,
    }),
  });
  if (!resendResponse.ok) {
    response
      .status(502)
      .send(
        page(
          'Something went sideways',
          'Email martin@evalarium.ai and we will add you by hand.',
        ),
      );
    return;
  }
  response
    .status(200)
    .send(
      page(
        'Pilot inquiry received',
        'Martin will reply with a concrete capture plan.',
      ),
    );
}
