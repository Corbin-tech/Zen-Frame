import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function checkOutputDirectory(out: string, force: boolean) {
  if (force) return;
  for (const file of ['results.json', 'ratings.csv']) {
    try { await access(resolve(out, file)); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue; throw new Error('Cannot check output directory'); }
    throw new Error('Output already contains results.json or ratings.csv; choose a new --out directory or pass --force to overwrite');
  }
}
