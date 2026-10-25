import net from 'node:net';

// Accepte les connexions TCP sans jamais répondre : simule un hôte bloqué
export async function silentServer() {
  const sockets = new Set();
  const server = net.createServer(socket => sockets.add(socket));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `postgres://postgres:postgres@127.0.0.1:${server.address().port}/x`,
    close: () => new Promise(resolve => { sockets.forEach(s => s.destroy()); server.close(resolve); }),
  };
}
