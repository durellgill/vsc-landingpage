#!/usr/bin/env node

import { execFileSync, spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const testOutputDirectory = join(repositoryRoot, 'out');
const typescriptCompiler = join(repositoryRoot, 'node_modules', 'typescript', 'bin', 'tsc');
const watchMode = process.argv.includes('--watch');

// TypeScript does not remove JavaScript for deleted or renamed tests. Starting from an empty
// output directory prevents stale test files from being discovered by vscode-test.
rmSync(testOutputDirectory, { recursive: true, force: true });

const compilerArguments = [typescriptCompiler, '-p', repositoryRoot, '--outDir', testOutputDirectory];
if (!watchMode)
{
  execFileSync(process.execPath, compilerArguments, { cwd: repositoryRoot, stdio: 'inherit' });
}
else
{
  const compiler = spawn(process.execPath, [...compilerArguments, '--watch'], {
    cwd: repositoryRoot,
    stdio: 'inherit',
  });
  process.on('SIGINT', () => compiler.kill('SIGINT'));
  process.on('SIGTERM', () => compiler.kill('SIGTERM'));
  compiler.on('exit', code => { process.exitCode = code ?? 1; });
}
