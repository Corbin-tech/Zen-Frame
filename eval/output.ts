import { access } from 'node:fs/promises';
import { resolve } from 'node:path';
export async function checkOutputDirectory(out: string, force: boolean) {
  for (const file of ['results.json', 'ratings.csv']) {
    await checkOutputFile(resolve(out, file), force, 'Output already contains results.json or ratings.csv; choose a new --out directory or pass --force to overwrite');
  }
}
export async function checkOutputFile(file: string, force: boolean, message = 'Output file already exists; choose a new --out file or pass --force to overwrite') {
  if (force) return;
  try { await access(file); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw new Error('Cannot check output path'); }
  throw new Error(message);
}
