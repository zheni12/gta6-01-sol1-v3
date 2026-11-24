// main.ts — the program that hands SOLMAR HEAT in. It copies game/ and
// screenshots/ from this repository into the output directory and writes
// dossier.json there with buildDossier from the kit's vendor library, so
// the dossier the scorer rebuilds from the same files matches byte for
// byte. Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Count every file and directory under a tree, the way the grader's
// output cap counts them, so the hand-in log can prove the entry fits.
function countEntries(dir: string): number {
  let n = 1;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    n += entry.isDirectory() ? countEntries(join(dir, entry.name)) : 1;
  }
  return n;
}

mkdirSync(outputDir, { recursive: true });
let copied = 0;
for (const part of ['game', 'screenshots']) {
  const dest = join(outputDir, part);
  rmSync(dest, { recursive: true, force: true });
  cpSync(join(repoRoot, part), dest, { recursive: true });
  copied += countEntries(dest);
}

const dossier = buildDossier(outputDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outputDir, 'dossier.json'), dossier);
console.log(`SOLMAR HEAT handed in: ${copied} files and directories copied, dossier.json (${dossier.length} bytes) written to ${outputDir}`);
