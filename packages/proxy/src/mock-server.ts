import { generateCACertificate, getLocal, type Mockttp } from 'mockttp';

export const createMockServer = async (): Promise<Mockttp> => {
  const certificateAuthority = await generateCACertificate({
    subject: {
      commonName: 'Evalarium development CA',
      organizationName: 'Evalarium development only',
    },
  });
  const server = getLocal({
    cors: false,
    https: certificateAuthority,
    recordTraffic: false,
    suggestChanges: false,
  });
  await server.start();
  return server;
};
