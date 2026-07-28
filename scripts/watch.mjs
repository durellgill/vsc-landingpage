#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const commands = [
  [npmCommand, ['run', 'watch:css']],
  [npmCommand, ['run', 'watch:webview']],
  [npmCommand, ['exec', '--', 'webpack', '--watch']]
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
