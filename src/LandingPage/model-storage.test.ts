import * as assert from 'assert';
import * as vscode from 'vscode';
import { LandingPageModel } from './LandingPageModel';
import { registerExtensionContext, saveLandingPageModel } from './model-storage';

suite('saveLandingPageModel', () => {
  test('resolves only after VS Code finishes the global-state write', async () => {
    let finishWrite:()=>void = () => {};
    const writeFinished = new Promise<void>(resolve => {finishWrite=resolve;});
    registerExtensionContext({
      globalState: {
        get: (_key:string, fallback?:unknown) => fallback,
        update: async () => {await writeFinished;},
        keys: () => [],
        setKeysForSync: () => {},
      },
    } as unknown as vscode.ExtensionContext);

    const model:LandingPageModel = {groups:[]};
    let saveResolved = false;
    const saving = saveLandingPageModel(model).then(() => {saveResolved=true;});
    await Promise.resolve();
    assert.strictEqual(saveResolved, false);

    finishWrite();
    await saving;
    assert.strictEqual(saveResolved, true);
  });
});
