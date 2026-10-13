import { mkdir, copyFile } from 'node:fs/promises';

const output = new URL('../dist/', import.meta.url);
await mkdir(output, { recursive: true });
// An explicit allowlist prevents environment files or backend source being published.
for (const name of ['index.html', 'styles.css', 'app.js']) {
  await copyFile(new URL(`../frontend/${name}`, import.meta.url), new URL(name, output));
}
console.log('Built frontend: dist/index.html, dist/styles.css, dist/app.js');
