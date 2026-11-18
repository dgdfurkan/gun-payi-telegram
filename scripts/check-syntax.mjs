// Tüm JavaScript dosyalarını `node --check` ile doğrular.
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));
const files = dir => readdirSync(dir, { withFileTypes: true }).flatMap(e => {
  const path = join(dir, e.name);
  return e.isDirectory() ? files(path) : /\.m?js$/.test(e.name) ? [path] : [];
});
const paths = ['web', 'worker', 'scripts', 'tests'].flatMap(d => files(join(root, d)));
for (const path of paths) {
  const r = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) process.exit(r.status || 1);
}
console.log(`${paths.length} JavaScript dosyası sözdizimi kontrolünden geçti.`);
