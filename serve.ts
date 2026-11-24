// serve.ts — a tiny static file server for playing SOLMAR HEAT locally.
// Run `node serve.ts`, then open http://localhost:8080 in a desktop
// browser. It serves only the game/ directory and refuses to climb out
// of it; the game itself makes no network requests once loaded.

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), 'game');
const port = Number(process.env.PORT ?? 8080);

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://localhost:${port}`);
  let path = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
  if (path === '' || path === '.') path = 'index.html';
  const file = join(root, path);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const ext = file.slice(file.lastIndexOf('.'));
  res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});

server.listen(port, () => {
  console.log(`SOLMAR HEAT serving at http://localhost:${port}`);
});
