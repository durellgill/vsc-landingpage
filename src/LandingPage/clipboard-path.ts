import * as vscode from 'vscode';
import { findItemByGuid, LandingPageModel, LandingPageProject } from './LandingPageModel';

/**
 * Puts a bookmark's target path on the clipboard, shell-quoted if it needs it.
 *
 * Uses `vscode.env.clipboard` rather than the webview's `navigator.clipboard`, which needs a
 * permission and a user gesture the webview cannot always supply.
 *
 * Local targets are copied as a platform path via `fsPath` - backslashes on Windows, no
 * `file://` and no percent-escapes - because that is what you paste into a terminal. Anything
 * else is copied as its URI, which is the only meaningful form it has.
 *
 * The page's confirmation tick is driven by the `pathCopied` reply posted at the end, never
 * assumed on click, so a failed copy shows no tick.
 *
 * @param guid Bookmark to copy.
 * @param sharedModel Model to resolve the GUID against.
 * @param webviewPanel Panel that gets the `pathCopied` confirmation.
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
  catch {/* not a URI: copy it exactly as stored */}

  text = shellQuote(text);

  try
  {
    await vscode.env.clipboard.writeText(text);
  }
  catch (err:any)
  {
    vscode.window.showErrorMessage(`Could not copy the path: ${err?.message ?? err}`);
    return; //no confirmation message, so the page does not show a false tick
  }

  webviewPanel.webview.postMessage({command:'pathCopied', guid});
  vscode.window.setStatusBarMessage(`Copied ${text}`, 3000);
}

/**
 * Quotes a path so it survives being pasted into a shell, and only when it needs it.
 *
 * A path with a space in it is the common case that breaks - `cd /Users/me/My Project` runs
 * `cd` with two arguments. Quoting unconditionally would be worse though: most paths need
 * nothing, and a quoted one pasted into a file dialog or an editor is wrong. So this only
 * acts when the text actually contains something a shell would treat specially.
 *
 * POSIX gets single quotes, which suppress every expansion; an embedded single quote is
 * closed, escaped and reopened (`'\''`), the only way to include one. Windows gets double
 * quotes, which is what `cmd` and PowerShell understand, and a Windows path cannot contain a
 * double quote so there is nothing further to escape.
 *
 * @param text Path to quote.
 * @returns The path, quoted only if a shell would otherwise mangle it.
 */
export function shellQuote(text:string):string
{
  // Whitespace, glob characters, redirections, expansions, quotes and comment markers.
  if (!/[\s'"\\$`&|;<>()*?\[\]{}!#~]/.test(text)) {return text;}

  if (process.platform==='win32') {return `"${text}"`;}
  return `'${text.replace(/'/g, `'\\''`)}'`;
}
