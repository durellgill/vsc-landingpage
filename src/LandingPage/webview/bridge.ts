export type Vscode = { postMessage(message:unknown):void };

declare function acquireVsCodeApi():Vscode;

export const vscode = acquireVsCodeApi();


export function post(command:string, data:Record<string, unknown>={}) {vscode.postMessage({command, ...data});}
