import * as assert from 'assert';
import { findItemByGuid, LandingPageModel } from './LandingPageModel';

const model = ():LandingPageModel => ({
  groups: [
    {guid:'work', label:'Work', projects:[
      {guid:'p1', label:'api'},
      {guid:'p2', label:'web'},
    ]},
    {guid:'play', label:'Play', projects:[
      {guid:'p3', label:'shaders'},
    ]},
  ],
});

suite('findItemByGuid', () => {
  test('finds a group, and reports no owner group for it', () => {
    const found = findItemByGuid('play', model());

    assert.ok(found);
    assert.strictEqual(found.target.label, 'Play');
    assert.strictEqual(found.ownerGroup, undefined, 'a group is contained by the model, not a group');
  });

  test('finds a bookmark, and names the group holding it', () => {
    const found = findItemByGuid('p3', model());

    assert.ok(found);
    assert.strictEqual(found.target.label, 'shaders');
    assert.strictEqual(found.ownerGroup?.guid, 'play');
  });

  test('searches groups before their contents, in board order', () => {
    const found = findItemByGuid('p1', model());

    assert.ok(found);
    assert.strictEqual(found.ownerGroup?.guid, 'work');
  });

  test('returns the model the item came from', () => {
    const m = model();
    const found = findItemByGuid('p2', m);

    assert.strictEqual(found?.model, m);
  });

  test('is null for an unknown guid', () => {
    assert.strictEqual(findItemByGuid('nope', model()), null);
  });

  test('is null for undefined or empty, without scanning', () => {
    assert.strictEqual(findItemByGuid(undefined, model()), null);
    assert.strictEqual(findItemByGuid('', model()), null);
  });
});
