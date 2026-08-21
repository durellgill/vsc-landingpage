#!/usr/bin/env node
// Build -> package -> install this extension into the local VS Code, in one step.
//
//   npm run install-local          build, package, install, delete the .vsix
//   npm run install-local -- --keep    ...but keep the .vsix afterwards
//
// The .vsix filename is derived from package.json rather than hardcoded, so bumping the
// version never breaks this script.

import { execFileSync, execSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const vsix = join(root, `${pkg.name}-${pkg.version}.vsix`);
const extensionId = `${pkg.publisher}.${pkg.name}`;
const keep = process.argv.includes('--keep');

const step = (msg) => console.log(`\n\x1b[36m▸ ${msg}\x1b[0m`);
const done = (msg) => console.log(`\x1b[32m✓\x1b[0m ${msg}`);
const warn = (msg) => console.log(`\x1b[33m!\x1b[0m ${msg}`);

function hasCodeCli() {
  try {
    execSync('command -v code', { stdio: 'ignore', shell: '/bin/sh' });
    return true;
  } catch {
    return false;
  }
}

try {
  // vsce runs `vscode:prepublish` -> `npm run package`, which inlines the CSS and bundles,
  // so there is no separate build step to run here.
  step(`Packaging ${extensionId} v${pkg.version}`);
  execFileSync('npx', ['-y', '@vscode/vsce', 'package'], { cwd: root, stdio: 'inherit' });
  if (!existsSync(vsix)) {
    throw new Error(`expected ${vsix} to exist after packaging`);
  }
  done(`Built ${pkg.name}-${pkg.version}.vsix`);

  if (!hasCodeCli()) {
    warn("The 'code' command is not on your PATH, so the extension was not installed.");
    warn("Add it with: Cmd+Shift+P -> \"Shell Command: Install 'code' command in PATH\"");
    console.log(`\nThen run:\n  code --install-extension ${vsix} --force\n`);
    process.exit(0);
  }

  // --force reinstalls even when the version has not changed, so you do not have to bump
  // the version just to try a build.
  step(`Installing into VS Code`);
  execFileSync('code', ['--install-extension', vsix, '--force'], { cwd: root, stdio: 'inherit' });
  done(`Installed ${extensionId}`);

  console.log(`\n\x1b[1mReload VS Code to pick it up:\x1b[0m Cmd+Shift+P -> "Developer: Reload Window"\n`);
} finally {
  if (!keep && existsSync(vsix)) {
    rmSync(vsix);
  }
}
