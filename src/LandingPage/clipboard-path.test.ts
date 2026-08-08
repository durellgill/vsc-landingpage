import * as assert from 'assert';
import { shellQuote } from './clipboard-path';

// `shellQuote` branches on `process.platform`, and the test process cannot change it, so the
// Windows branch is asserted only when actually running there. Skipping is honest; asserting the
// POSIX result on Windows would be asserting the wrong thing.
const onWindows = process.platform === 'win32';

suite('shellQuote', () => {
  test('leaves an ordinary path completely alone', () => {
    // Quoting unconditionally would be wrong the moment the path is pasted into a file dialog
    // or an editor rather than a shell.
    assert.strictEqual(shellQuote('/Users/me/projects/api'), '/Users/me/projects/api');
    assert.strictEqual(shellQuote('/tmp/a-b_c.123'), '/tmp/a-b_c.123');
  });

  test('quotes a path containing a space', function () {
    if (onWindows) {return this.skip();}
    // The common case that breaks: `cd /Users/me/My Project` runs cd with two arguments.
    assert.strictEqual(shellQuote('/Users/me/My Project'), `'/Users/me/My Project'`);
  });

  test('closes, escapes and reopens an embedded single quote', function () {
    if (onWindows) {return this.skip();}
    // `'\''` is the only way to get a single quote inside a single-quoted POSIX string.
    assert.strictEqual(shellQuote(`/tmp/it's here`), `'/tmp/it'\\''s here'`);
  });

  test('quotes every metacharacter a shell would act on', function () {
    if (onWindows) {return this.skip();}
    for (const raw of ['/tmp/a$b', '/tmp/a`b', '/tmp/a&b', '/tmp/a|b', '/tmp/a;b', '/tmp/a<b',
      '/tmp/a>b', '/tmp/a*b', '/tmp/a?b', '/tmp/a[b', '/tmp/a(b', '/tmp/a{b', '/tmp/a!b',
      '/tmp/a#b', '/tmp/a~b', '/tmp/a\\b', '/tmp/a"b']) {
      assert.strictEqual(shellQuote(raw), `'${raw}'`, `${raw} must be quoted`);
    }
  });

  test('uses double quotes on Windows', function () {
    if (!onWindows) {return this.skip();}
    // cmd and PowerShell understand double quotes, and a Windows path cannot contain one, so
    // there is nothing further to escape.
    assert.strictEqual(shellQuote('C:\\Users\\me\\My Project'), '"C:\\Users\\me\\My Project"');
  });
});
