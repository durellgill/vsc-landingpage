#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
// The extension build inlines the webview bundle as text, so the webview watcher has to be
// the one that rebuilds first. Vite writes the bundle, the extension watcher sees the file
// change and re-inlines it.
const commands = [
  [npmCommand, ['run', 'build:webview', '--', '--watch']],
  [npmCommand, ['run', 'build:extension', '--', '--watch']]
];
const watchers = commands.map(([command, args]) =>
  spawn(command, args, { cwd: root, stdio: 'inherit' })
);

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) { return; }
  stopping = true;
  for (const watcher of watchers) { watcher.kill('SIGTERM'); }
  process.exit(exitCode);
}

for (const watcher of watchers) {
  watcher.on('exit', code => {
    if (!stopping && code !== 0) { stop(code ?? 1); }
  });
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());
