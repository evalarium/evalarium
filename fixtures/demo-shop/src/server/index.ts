import { fileURLToPath } from 'node:url';
import type { AddressInfo } from 'node:net';
import path from 'node:path';

import express from 'express';

const products = [
  {
    id: 'mug-1',
    name: 'Deterministic Mug',
    description: 'Holds exactly one reproducible cup of coffee.',
    priceCents: 1999,
  },
];

const isCartItem = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.productId === 'string' && record.quantity === 1;
};

const app = express();
app.use(express.json());

app.get('/api/products', (_request, response) => {
  response.json(products);
});

app.post('/api/cart', (request, response) => {
  const body: unknown = request.body;
  if (!isCartItem(body)) {
    response.status(400).json({ error: 'Invalid cart item.' });
    return;
  }
  response.status(201).json({ accepted: true });
});

app.post('/api/orders', (request, response) => {
  const body: unknown = request.body;
  if (
    body === null ||
    typeof body !== 'object' ||
    !Array.isArray((body as Record<string, unknown>).cart)
  ) {
    response.status(400).json({ error: 'Invalid order.' });
    return;
  }
  response.status(201).json({
    orderId: `order-${Math.random().toString(36).slice(2, 10)}`,
    createdAt: Date.now(),
  });
});

const clientDirectory = fileURLToPath(new URL('../client', import.meta.url));
app.use(express.static(clientDirectory));
app.use((_request, response) => {
  response.sendFile(path.join(clientDirectory, 'index.html'));
});

const requestedPort = Number(process.env.PORT ?? '0');
const server = app.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address() as AddressInfo;
  process.stdout.write(
    `EVALARIUM_FIXTURE_URL=http://127.0.0.1:${address.port}\n`,
  );
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
