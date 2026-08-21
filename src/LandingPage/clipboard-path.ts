import * as vscode from 'vscode';
import { findItemByGuid, LandingPageModel, LandingPageProject } from './LandingPageModel';

/**
 * Uses the host clipboard because the webview clipboard has permission and gesture constraints. Local targets are copied as `fsPath`, other targets as URIs, and success appears only after the host confirms the write.
 */
export async function copyPath(guid:string|undefined, sharedModel:LandingPageModel, webviewPanel:vscode.WebviewPanel):Promise<void>
{
  const found = findItemByGuid(guid, sharedModel);
  const path = (found?.target as LandingPageProject|undefined)?.path;
  if (!path) {return;}

  let text = path;
  try
  {
    const uri = vscode.Uri.parse(path);
    if (uri.scheme==='file') {text = uri.fsPath;}
  }
  catch {}

  text = shellQuote(text);

  try
  {
    await vscode.env.clipboard.writeText(text);
  }
  catch (err:any)
  {
    vscode.window.showErrorMessage(`Could not copy the path: ${err?.message ?? err}`);
    return;
  }

  webviewPanel.webview.postMessage({command:'pathCopied', guid});
  vscode.window.setStatusBarMessage(`Copied ${text}`, 3000);
}

/**
 * Quotes only text containing shell metacharacters. POSIX uses single quotes with embedded-quote reopening, while Windows uses double quotes.
 */
export function shellQuote(text:string):string
{
  if (!/[\s'"\\$`&|;<>()*?\[\]{}!#~]/.test(text)) {return text;}

  if (process.platform==='win32') {return `"${text}"`;}
  return `'${text.replace(/'/g, `'\\''`)}'`;
}
