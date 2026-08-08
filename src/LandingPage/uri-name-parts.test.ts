import * as assert from 'assert';
import * as vscode from 'vscode';
import { parseUriNameParts } from './uri-name-parts';

suite('parseUriNameParts', () => {
  test('splits a file into base name and extension', () => {
    const parts = parseUriNameParts(vscode.Uri.file('/Users/me/notes.md'));

    assert.strictEqual(parts.basename, 'notes');
    assert.strictEqual(parts.ext, 'md');
  });

  test('a folder has no extension', () => {
    const parts = parseUriNameParts(vscode.Uri.file('/Users/me/projects'));

    assert.strictEqual(parts.basename, 'projects');
    assert.strictEqual(parts.ext, undefined);
  });

  test('splits on the *last* dot', () => {
    const parts = parseUriNameParts(vscode.Uri.file('/Users/me/everything.code-workspace'));

    assert.strictEqual(parts.basename, 'everything');
    assert.strictEqual(parts.ext, 'code-workspace');
  });

  test('a dotted folder looks exactly like a file, which is the documented caveat', () => {
    // This is why `makeBookmark` stats the URI rather than trusting `ext` to say "file".
    const parts = parseUriNameParts(vscode.Uri.file('/Users/me/my.app'));

    assert.strictEqual(parts.basename, 'my');
    assert.strictEqual(parts.ext, 'app');
  });

  test('a leading dot is a name, not an extension', () => {
    // `.gitignore` has basename `.gitignore`: the split only happens at a dot past position 0.
    const parts = parseUriNameParts(vscode.Uri.file('/Users/me/.gitignore'));

    assert.strictEqual(parts.basename, '.gitignore');
    assert.strictEqual(parts.ext, undefined);
  });

  test('keeps only the last path segment', () => {
    const parts = parseUriNameParts(vscode.Uri.file('/a/b/c/d/deep.txt'));

    assert.strictEqual(parts.basename, 'deep');
  });
});
