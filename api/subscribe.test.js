import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import handler from './subscribe.js';

const inquiry = {
  email: 'ada@example.com',
  company: 'Northwind Labs',
  useCase: 'Evaluate an agent that updates opportunities in our CRM.',
  website: '',
};

const createResponse = () => {
  const response = {
    statusCode: 200,
    headers: {},
    body: '',
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
  };
  return response;
};

describe('pilot inquiry endpoint', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
    vi.unstubAllGlobals();
  });

  it('rejects incomplete inquiries', async () => {
    const response = createResponse();
    await handler(
      { method: 'POST', headers: {}, body: { ...inquiry, useCase: 'short' } },
      response,
    );

    expect(response.statusCode).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('silently accepts honeypot submissions without sending email', async () => {
    const response = createResponse();
    await handler(
      {
        method: 'POST',
        headers: {},
        body: { ...inquiry, website: 'spam.test' },
      },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('forwards a qualified inquiry to Resend', async () => {
    const response = createResponse();
    await handler({ method: 'POST', headers: {}, body: inquiry }, response);

    expect(response.statusCode).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
    const [, options] = fetch.mock.calls[0];
    const payload = JSON.parse(options.body);
    expect(payload.subject).toContain(inquiry.email);
    expect(payload.text).toContain(inquiry.company);
    expect(payload.text).toContain(inquiry.useCase);
  });

  it('fails safely when Resend is not configured', async () => {
    delete process.env.RESEND_API_KEY;
    const response = createResponse();
    await handler({ method: 'POST', headers: {}, body: inquiry }, response);

    expect(response.statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
  });
});
