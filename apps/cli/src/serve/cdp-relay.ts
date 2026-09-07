import { connect, createServer, type Socket } from 'node:net';

export interface CdpRelay {
  /** Open client connections; used to tell a live agent from a dead one. */
  activeConnections(): number;
  close(): Promise<void>;
}

export type StartCdpRelay = (
  publicPort: number,
  internalPort: number,
  host: string,
) => Promise<CdpRelay>;

export const startCdpRelay: StartCdpRelay = async (
  publicPort,
  internalPort,
  host,
) => {
  const sockets = new Set<Socket>();
  const clients = new Set<Socket>();
  const server = createServer((socket) => {
    const upstream = connect(internalPort, '127.0.0.1');
    clients.add(socket);
    sockets.add(socket);
    sockets.add(upstream);
    socket.pipe(upstream);
    upstream.pipe(socket);
    const teardown = (): void => {
      clients.delete(socket);
      sockets.delete(socket);
      sockets.delete(upstream);
      socket.destroy();
      upstream.destroy();
    };
    socket.on('close', teardown);
    upstream.on('close', teardown);
    socket.on('error', teardown);
    upstream.on('error', teardown);
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(publicPort, host, () => {
      server.off('error', reject);
      resolve();
    });
  });

  let closePromise: Promise<void> | null = null;
  return {
    activeConnections: () => clients.size,
    close: () => {
      closePromise ??= new Promise<void>((resolve, reject) => {
        for (const socket of sockets) {
          socket.destroy();
        }
        server.close((error) => {
          if (error === undefined) {
            resolve();
          } else {
            reject(error);
          }
        });
      });
      return closePromise;
    },
  };
};
