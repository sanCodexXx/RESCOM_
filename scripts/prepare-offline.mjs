import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { zipSync } from 'fflate';

const root = 'dist/client';
const files = (await readdir(join(root, '_next/static'), { recursive: true, withFileTypes: true }))
  .filter(entry => entry.isFile())
  .map(entry => '/' + relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'));
const assets = [
  ...files, '/images/san-nicolas-logo.png', '/favicon.svg', '/images/starlink-orbital-window.webp', '/images/community.jpg',
];
for (const file of await readdir(join(root, 'fonts'))) {
  if (file.endsWith('.ttf')) assets.push('/fonts/' + file);
}
const version = createHash('sha256');
for (const asset of assets.sort()) version.update(await readFile(join(root, asset.slice(1))));
const worker = await readFile('scripts/offline-worker.js', 'utf8');
version.update(worker);
await writeFile(join(root, 'rescom-offline.js'),
  'const CACHE = "rescom-shell-' + version.digest('hex').slice(0, 16) + '";\n'
  + 'const ASSETS = ' + JSON.stringify(assets) + ';\n' + worker);

const relayFiles = ['README.md', 'dish.proto', 'relay.js', 'package.json', 'package-lock.json'];
const archive = Object.fromEntries(await Promise.all(relayFiles.map(async name => [
  name, await readFile(join('starlink-relay', name)),
])));
await writeFile(join(root, 'rescom-starlink-relay.zip'), zipSync(archive));
