import * as assert from 'assert';
import { LandingPageGroup, LandingPageModel, LandingPageProject } from './LandingPageModel';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';
import { moveBookmark, moveGroup } from './bookmark-moves';

function bookmark(label:string):LandingPageProject
{
  return {guid:`guid-${label}`, label, path:`file:///tmp/${label}`};
}

function group(guid:string, ...labels:string[]):LandingPageGroup
{
  return {guid, label:guid, projects:labels.map(bookmark)};
}

function order(g:LandingPageGroup):string[]
{
  return g.projects.map(p => p.label);
}

suite('moveBookmark', () => {
  test('moving one down inside its own group does not lose a place as the gap closes', () => {
    // The documented trap: `beforeGuid` names a landing point, and the index is resolved after
    // the bookmark has been lifted out. Moving `a` to just before `c` must put it between b and
    // c, not between c and d - which is what resolving the index before the lift would give.
    const g = group('work', 'a', 'b', 'c', 'd');
    const model:LandingPageModel = {groups:[g]};

    assert.strictEqual(moveBookmark('guid-a', 'work', 'guid-c', model), true);
    assert.deepStrictEqual(order(g), ['b', 'a', 'c', 'd']);
  });

  test('moving one up inside its own group lands in front of the target', () => {
    const g = group('work', 'a', 'b', 'c', 'd');
    const model:LandingPageModel = {groups:[g]};

    assert.strictEqual(moveBookmark('guid-d', 'work', 'guid-b', model), true);
    assert.deepStrictEqual(order(g), ['a', 'd', 'b', 'c']);
  });

  test('an absent beforeGuid means the end of the destination', () => {
    const from = group('work', 'a', 'b');
    const to = group('play', 'x');
    const model:LandingPageModel = {groups:[from, to]};

    assert.strictEqual(moveBookmark('guid-a', 'play', undefined, model), true);
    assert.deepStrictEqual(order(from), ['b']);
    assert.deepStrictEqual(order(to), ['x', 'a']);
  });

  test('a drop back where it started changes nothing and reports no write', () => {
    const g = group('work', 'a', 'b', 'c');
    const model:LandingPageModel = {groups:[g]};

    assert.strictEqual(moveBookmark('guid-b', 'work', 'guid-c', model), false);
    assert.deepStrictEqual(order(g), ['a', 'b', 'c']);
  });

  test('dragging out of Recent copies, leaving the original in place with a new guid', () => {
    // Recent is rebuilt from VS Code's history on almost every message, so a bookmark *moved*
    // out of it would come straight back on the next sync.
    const recent = group(RECENT_GROUP_GUID, 'r');
    const work = group('work');
    const model:LandingPageModel = {groups:[work, recent]};

    assert.strictEqual(moveBookmark('guid-r', 'work', undefined, model), true);
    assert.deepStrictEqual(order(recent), ['r'], 'the Recent entry must survive the copy');
    assert.deepStrictEqual(order(work), ['r']);
    assert.notStrictEqual(work.projects[0].guid, 'guid-r', 'the copy needs its own guid');
  });

  test('Recent is refused as a destination', () => {
    const work = group('work', 'a');
    const recent = group(RECENT_GROUP_GUID, 'r');
    const model:LandingPageModel = {groups:[work, recent]};

    assert.strictEqual(moveBookmark('guid-a', RECENT_GROUP_GUID, undefined, model), false);
    assert.deepStrictEqual(order(recent), ['r']);
    assert.deepStrictEqual(order(work), ['a']);
  });

  test('a guid that is a group, or is unknown, is not a bookmark move', () => {
    const model:LandingPageModel = {groups:[group('work', 'a')]};

    assert.strictEqual(moveBookmark('work', 'work', undefined, model), false);
    assert.strictEqual(moveBookmark('nope', 'work', undefined, model), false);
    assert.strictEqual(moveBookmark(undefined, 'work', undefined, model), false);
  });
});

suite('moveGroup', () => {
  const guids = (model:LandingPageModel) => model.groups.map(g => g.guid);

  test('a downward toIndex loses one place, because it was measured before the lift', () => {
    // `toIndex` is the insertion point the drop indicator was drawn at, measured while the
    // dragged group was still in the list. Dropping `a` at index 2 must land it between b and c.
    const model:LandingPageModel = {groups:[group('a'), group('b'), group('c')]};

    assert.strictEqual(moveGroup('a', undefined, 2, model), true);
    assert.deepStrictEqual(guids(model), ['b', 'a', 'c']);
  });

  test('an upward toIndex is used as given', () => {
    const model:LandingPageModel = {groups:[group('a'), group('b'), group('c')]};

    assert.strictEqual(moveGroup('c', undefined, 1, model), true);
    assert.deepStrictEqual(guids(model), ['a', 'c', 'b']);
  });

  test('a one-step direction swaps with the neighbour', () => {
    const model:LandingPageModel = {groups:[group('a'), group('b'), group('c')]};

    assert.strictEqual(moveGroup('b', 'up', undefined, model), true);
    assert.deepStrictEqual(guids(model), ['b', 'a', 'c']);
    assert.strictEqual(moveGroup('b', 'down', undefined, model), true);
    assert.deepStrictEqual(guids(model), ['a', 'b', 'c']);
  });

  test('a direction off either end is refused rather than clamped', () => {
    const model:LandingPageModel = {groups:[group('a'), group('b')]};

    assert.strictEqual(moveGroup('a', 'up', undefined, model), false);
    assert.strictEqual(moveGroup('b', 'down', undefined, model), false);
    assert.deepStrictEqual(guids(model), ['a', 'b']);
  });

  test('generated Recent stays last and cannot itself be moved', () => {
    const model:LandingPageModel = {groups:[group('a'), group('b'), group(RECENT_GROUP_GUID)]};

    assert.strictEqual(moveGroup('b', 'up', undefined, model), true);
    assert.deepStrictEqual(guids(model), ['b', 'a', RECENT_GROUP_GUID]);
    assert.strictEqual(moveGroup(RECENT_GROUP_GUID, 'up', undefined, model), false);
    assert.deepStrictEqual(guids(model), ['b', 'a', RECENT_GROUP_GUID]);
  });

  test('a group dropped back where it started reports no write', () => {
    const model:LandingPageModel = {groups:[group('a'), group('b'), group('c')]};

    assert.strictEqual(moveGroup('b', undefined, 1, model), false);
    assert.deepStrictEqual(guids(model), ['a', 'b', 'c']);
  });
});
