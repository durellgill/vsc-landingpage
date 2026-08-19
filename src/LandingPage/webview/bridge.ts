/**
 * The only channel out of the sandboxed page.
 *
 * Isolated so every module can post without importing `main`, which would make the graph
 * circular - `main` imports the components, and the components post. See D002.
 */

export type Vscode = { postMessage(message:unknown):void };

declare function acquireVsCodeApi():Vscode;

export const vscode = acquireVsCodeApi();


export function post(command:string, data:Record<string, unknown>={}) {vscode.postMessage({command, ...data});}
