import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
function run(args) {
  const result = spawnSync('corepack', ['pnpm', ...args], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['build']);
// The checked-in Android shell is authoritative; never overwrite native edits.
if (!existsSync('android/app/src/main/AndroidManifest.xml')) run(['exec', 'cap', 'add', 'android']);
run(['exec', 'cap', 'sync', 'android']);
