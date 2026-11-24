// shoot.mjs — takes SOLMAR HEAT's four screenshots. It serves game/ on a
// local port, opens each staged scene (?shot=<name>) in headless Chromium
// at 1280x800, waits for the game to signal __SHOT_READY, and writes JPEGs
// into screenshots/. Any page error fails the run, and any shot over the
// 256 KiB gate limit is re-taken at a lower JPEG quality until it fits.
//
// Run: node scripts/shoot.mjs

import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const gameRoot = join(repoRoot, 'game');
const shots = JSON.parse(readFileSync(join(repoRoot, 'shots.json'), 'utf8'));
const MAX_BYTES = 262144;

// playwright-core is a tool of the workspace, not of this repository; the
// game itself ships no dependencies.
const require = createRequire(join(homedir(), 'lemo-opuscar', 'noop.js'));
const { chromium } = require('playwright-core');

function findChromium() {
  const base = join(homedir(), '.cache', 'ms-playwright');
  const dirs = readdirSync(base).filter((d) => d.startsWith('chromium_headless_shell-')).sort().reverse();
  for (const d of dirs) {
    const exe = join(base, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell');
    if (existsSync(exe)) return exe;
  }
  throw new Error('no headless chromium found under ~/.cache/ms-playwright');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

function serve() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let path = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
      if (path === '' || path === '.') path = 'index.html';
      const file = join(gameRoot, path);
      if (!file.startsWith(gameRoot) || !existsSync(file) || !statSync(file).isFile()) {
        res.writeHead(404); res.end('not found'); return;
      }
      const ext = file.slice(file.lastIndexOf('.'));
      res.writeHead(200, { 'content-type': MIME[ext] ?? 'application/octet-stream' });
      res.end(readFileSync(file));
    });
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

async function main() {
  const { server, port } = await serve();
  const browser = await chromium.launch({
    executablePath: findChromium(),
    args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--mute-audio'],
  });
  const failures = [];
  try {
    for (const shot of shots.shots) {
      const page = await browser.newPage({ viewport: shots.viewport });
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
      const url = `http://127.0.0.1:${port}/?seed=${shots.seed}&shot=${shot.param}`;
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await page.waitForFunction(() => window.__SHOT_READY === true, null, { timeout: 90000 });
      await page.waitForTimeout(420);   // let one live frame settle
      const out = join(repoRoot, shot.file);
      let quality = 84;
      let size = Infinity;
      while (quality >= 40) {
        const buf = await page.screenshot({ type: 'jpeg', quality });
        size = buf.length;
        if (size <= MAX_BYTES) { writeFileSync(out, buf); break; }
        quality -= 14;
      }
      if (size > MAX_BYTES) failures.push(`${shot.name}: ${size} bytes at lowest quality`);
      if (errors.length) failures.push(`${shot.name}: ${errors.join(' | ')}`);
      console.log(`${shot.name}: ${size} bytes, ${errors.length} page errors -> ${shot.file}`);
      await page.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
  if (failures.length) {
    console.error(`SHOOT FAILED:\n${failures.join('\n')}`);
    process.exit(1);
  }
  console.log('SHOOT OK');
}

main().catch((err) => { console.error(err); process.exit(1); });
