import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
const root = resolve('public');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
};
createServer(async (req, res) => {
  try {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.writeHead(405, { Allow: 'GET, HEAD' }).end();
      return;
    }
    const pathname = decodeURIComponent(
      new URL(req.url, 'http://localhost').pathname,
    );
    if (pathname === '/healthz') {
      res
        .writeHead(200, { 'Content-Type': 'text/plain' })
        .end(req.method === 'HEAD' ? undefined : 'ok');
      return;
    }
    if (pathname.startsWith('/v1/')) {
      res.writeHead(404).end();
      return;
    }
    const portal = { admin: '/admin', provider: '/provider' }[
      process.env.PORTAL
    ];
    if (pathname === '/' && portal) {
      res.writeHead(302, { Location: portal }).end();
      return;
    }
    let file = resolve(root, '.' + pathname);
    if (file !== root && !file.startsWith(root + sep)) {
      res.writeHead(404).end();
      return;
    }
    try {
      if (!(await stat(file)).isFile()) throw new Error('Not a file');
    } catch {
      if (extname(pathname)) {
        res.writeHead(404).end('Not found');
        return;
      }
      file = resolve(root, 'index.html');
    }
    const bytes = await readFile(file);
    res.setHeader(
      'Content-Type',
      types[extname(file)] ?? 'application/octet-stream',
    );
    res.setHeader(
      'Cache-Control',
      pathname.startsWith('/assets/')
        ? 'public, max-age=31536000, immutable'
        : 'no-store',
    );
    res.setHeader('Content-Length', bytes.length);
    res.writeHead(200);
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {
    res.writeHead(400).end('Invalid request');
  }
}).listen(Number(process.env.PORT ?? 3000), '0.0.0.0');
