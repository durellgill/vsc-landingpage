import * as assert from 'assert';
import { LandingPageGroup, LandingPageModel } from './LandingPageModel';
import { createdDirectoryBookmarkGroup } from './bookmark-creation';
import { RECENT_GROUP_GUID } from './recent-mru-overlay';

suite('createdDirectoryBookmarkGroup', () => {
  test('page-level folder creation does not create or choose a bookmark group', () => {
    const recent:LandingPageGroup = {guid:RECENT_GROUP_GUID, label:'Recent', projects:[]};
    const model:LandingPageModel = {groups:[recent]};

    assert.strictEqual(createdDirectoryBookmarkGroup(undefined, model), undefined);
    assert.deepStrictEqual(model.groups, [recent]);
  });

  test('group-level folder creation keeps its explicit bookmark destination', () => {
    const work:LandingPageGroup = {guid:'work', label:'Work', projects:[]};
    const model:LandingPageModel = {groups:[work]};

    assert.strictEqual(createdDirectoryBookmarkGroup(work.guid, model), work);
  });
});
