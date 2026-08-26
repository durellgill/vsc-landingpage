import * as assert from 'assert';
import { shellQuote } from './clipboard-path';

suite('shellQuote', () => {
  test('leaves an ordinary Windows path with backslashes alone', () => {
    assert.strictEqual(shellQuote('C:\\Users\\me\\project', 'win32'), 'C:\\Users\\me\\project');
  });

  test('leaves an ordinary path completely alone', () => {
    assert.strictEqual(shellQuote('/Users/me/projects/api'), '/Users/me/projects/api');
    assert.strictEqual(shellQuote('/tmp/a-b_c.123'), '/tmp/a-b_c.123');
  });

  test('quotes a POSIX path containing a space', () => {
    assert.strictEqual(shellQuote('/Users/me/My Project', 'darwin'), `'/Users/me/My Project'`);
  });

  test('closes, escapes and reopens an embedded POSIX single quote', () => {
    // `'\''` is the only way to get a single quote inside a single-quoted POSIX string.
    assert.strictEqual(shellQuote(`/tmp/it's here`, 'darwin'), `'/tmp/it'\\''s here'`);
  });

  test('quotes every metacharacter a POSIX shell would act on', () => {
    for (const raw of ['/tmp/a$b', '/tmp/a`b', '/tmp/a&b', '/tmp/a|b', '/tmp/a;b', '/tmp/a<b',
      '/tmp/a>b', '/tmp/a*b', '/tmp/a?b', '/tmp/a[b', '/tmp/a(b', '/tmp/a{b', '/tmp/a!b',
      '/tmp/a#b', '/tmp/a~b', '/tmp/a\\b', '/tmp/a"b']) {
      assert.strictEqual(shellQuote(raw, 'darwin'), `'${raw}'`, `${raw} must be quoted`);
    }
  });

  test('uses double quotes for Windows paths containing spaces', () => {
    assert.strictEqual(shellQuote('C:\\Users\\me\\My Project', 'win32'), '"C:\\Users\\me\\My Project"');
  });
});
