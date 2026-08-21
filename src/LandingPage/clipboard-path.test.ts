import * as assert from 'assert';
import { shellQuote } from './clipboard-path';

// `shellQuote` branches on `process.platform`, and the test process cannot change it, so the
// Windows branch is asserted only when actually running there. Skipping is honest; asserting the
// POSIX result on Windows would be asserting the wrong thing.
const onWindows = process.platform === 'win32';

suite('shellQuote', () => {
  test('leaves an ordinary path completely alone', () => {
    assert.strictEqual(shellQuote('/Users/me/projects/api'), '/Users/me/projects/api');
    assert.strictEqual(shellQuote('/tmp/a-b_c.123'), '/tmp/a-b_c.123');
  });

  test('quotes a path containing a space', function () {
    if (onWindows) {return this.skip();}
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
    assert.strictEqual(shellQuote('C:\\Users\\me\\My Project'), '"C:\\Users\\me\\My Project"');
  });
});
