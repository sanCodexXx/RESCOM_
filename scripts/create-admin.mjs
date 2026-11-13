import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

const [input, target, ...extra] = process.argv.slice(2);
const parsed = z.string().email().max(180).safeParse(input?.trim().toLowerCase());
if (!parsed.success || !['--local', '--remote'].includes(target) || extra.length) {
  console.error('Usage: pnpm admin:create you@example.com --local|--remote');
  process.exit(1);
}

const configFile = target === '--remote' ? 'wrangler.cloudflare.json' : 'wrangler.local.json';
let config;
try {
  config = JSON.parse(readFileSync(configFile, 'utf8'));
} catch {
  console.error('Open the publishing guide and configure ' + configFile + ' first.');
  process.exit(1);
}
const binding = config.d1_databases?.find(database => database.binding === 'DB');
if (!binding || (target === '--remote' && !/^[0-9a-f-]{36}$/i.test(binding.database_id))) {
  console.error('Set the DB binding and its D1 database ID in ' + configFile + '.');
  process.exit(1);
}

const email = parsed.data;
const password = randomBytes(18).toString('base64url');
const salt = randomUUID();
const digest = salt + ':' + pbkdf2Sync(password, salt, 100000, 32, 'sha256').toString('hex');
const created = new Date().toISOString();
const quote = value => "'" + value.replaceAll("'", "''") + "'";
const values = [randomUUID(), 'live', 'RESCOM administrator', email, 'admin', 'admin', 'Active', '', digest, created, created];
const sql = 'INSERT INTO accounts(id,space,name,email,role,requested_role,status,center_id,password_hash,verified_at,created_at) VALUES ('
  + values.map(quote).join(',') + ');\n';
const temp = mkdtempSync(join(tmpdir(), 'rescom-admin-'));

try {
  const file = join(temp, 'create-admin.sql');
  writeFileSync(file, sql, { mode: 0o600 });
  const localArgs = target === '--local' ? ['--persist-to', '.wrangler/state'] : [];
  const result = spawnSync(process.execPath, [
    './node_modules/wrangler/bin/wrangler.js', 'd1', 'execute', 'DB',
    '--config', configFile, target, '--file', file, '--yes', ...localArgs,
  ], { encoding: 'utf8' });
  if (result.status !== 0) {
    const output = [result.stdout, result.stderr].filter(Boolean).join('\n');
    if (output.includes('UNIQUE constraint failed')) {
      console.error('This email already has an account. Sign in with its existing password or use password reset.');
    } else if (output.includes('no such table')) {
      console.error('Apply the D1 migrations before creating the administrator.');
    } else {
      console.error('Could not create the administrator. Confirm your Wrangler sign-in, database binding, and migrations.');
    }
    process.exitCode = 1;
  } else {
    console.log('Administrator created for ' + email);
    console.log('Generated password: ' + password);
    console.log('Save the password in your password manager.');
  }
} finally {
  rmSync(temp, { recursive: true, force: true });
}
