import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function offlineShell() {
  let output;
  return {
    name: 'rescom-offline-shell',
    apply: 'build',
    configResolved(config) {
      output = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const assets = (await readdir(resolve(output, 'assets'))).sort().map(name => `/assets/${name}`);
      const files = ['/index.html', '/manifest.webmanifest', '/rescom-icon.svg', ...assets];
      const worker = await readFile(new URL('./offline-worker.js', import.meta.url), 'utf8');
      const hash = createHash('sha256').update(worker).update(JSON.stringify(files));
      for (const name of ['index.html', 'manifest.webmanifest', 'rescom-icon.svg']) hash.update(await readFile(resolve(output, name)));
      const version = hash.digest('hex').slice(0, 16);
      await writeFile(resolve(output, 'rescom-sw.js'),
        `const CACHE_NAME = 'rescom-shell-${version}';\nconst SHELL_FILES = new Set(${JSON.stringify(files)});\n${worker}`);
    }
  };
}

export default defineConfig({
  plugins: [react(), offlineShell()],
  server: { port: 5173 }
});
