import { createServer } from 'node:net';
export async function smtpSink(port = 2527) {
  const messages = [],
    connections = new Set();
  const server = createServer((socket) => {
    connections.add(socket);
    socket.setEncoding('utf8');
    socket.write('220 localhost test mail sink\r\n');
    let pending = '',
      inData = false,
      lines = [];
    socket.on('close', () => connections.delete(socket));
    socket.on('data', (chunk) => {
      pending += chunk;
      while (pending.includes('\n')) {
        const index = pending.indexOf('\n'),
          line = pending.slice(0, index).replace(/\r$/, '');
        pending = pending.slice(index + 1);
        if (inData) {
          if (line === '.') {
            messages.push(lines.join('\r\n'));
            lines = [];
            inData = false;
            socket.write('250 queued locally\r\n');
          } else lines.push(line);
          continue;
        }
        if (/^EHLO|^HELO/i.test(line))
          socket.write('250-localhost\r\n250 SIZE 20971520\r\n');
        else if (/^MAIL FROM:/i.test(line) || /^RSET|^NOOP/i.test(line))
          socket.write('250 ok\r\n');
        else if (/^RCPT TO:/i.test(line))
          socket.write(
            /@(?:[^>]*\.)?example\.invalid>/i.test(line)
              ? '250 ok\r\n'
              : '550 Test addresses only\r\n',
          );
        else if (/^DATA/i.test(line)) {
          inData = true;
          socket.write('354 end with a dot\r\n');
        } else if (/^QUIT/i.test(line)) {
          socket.end('221 bye\r\n');
        } else socket.write('250 ok\r\n');
      }
    });
  });
  await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
  return {
    messages,
    close: async () => {
      for (const socket of connections) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
export const decodeMail = (raw) =>
  raw
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_, hex) =>
      String.fromCharCode(parseInt(hex, 16)),
    );
