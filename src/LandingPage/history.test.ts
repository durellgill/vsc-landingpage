import * as assert from 'assert';
import * as vscode from 'vscode';
import { importVscRecentList } from './history';

const originalExecuteCommand = vscode.commands.executeCommand;

async function withRecentHistory<T>(history:unknown, run:()=>Promise<T>):Promise<T>
{
  const descriptor = Object.getOwnPropertyDescriptor(vscode.commands, 'executeCommand');
  Object.defineProperty(vscode.commands, 'executeCommand', {
    configurable:true,
    writable:true,
    value:async (command:string) => command==='_workbench.getRecentlyOpened'
      ? history
      : originalExecuteCommand.call(vscode.commands, command),
  });

  try {return await run();}
  finally
  {
    if (descriptor) {Object.defineProperty(vscode.commands, 'executeCommand', descriptor);}
    else {vscode.commands.executeCommand = originalExecuteCommand;}
  }
}

suite('importVscRecentList', () => {
  test('keeps an extensionless filename free of an undefined suffix', async () => {
    const result = await withRecentHistory({
      workspaces:[],
      files:[{fileUri:vscode.Uri.file('Makefile')}],
    }, importVscRecentList);

    assert.strictEqual(result[0]?.label, 'Makefile');
  });

  test('degrades to an empty list when recent history is unavailable', async () => {
    const result = await withRecentHistory(undefined, importVscRecentList);
    assert.deepStrictEqual(result, []);
  });
});
