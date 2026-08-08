import { Uri } from "vscode";

/**
 * The base name and file extension of a URI, split apart. Result of {@link parseUriNameParts}.
 */
export interface UriNameParts
{
  /**
   * File or folder basename, which is usually
   * the file name without extension or the folder name.
   */
  basename:string;
  /**
   * If URI has a dot notation in its name, this field
   * contains the extension without dot, i.e. 'txt'.
   */
  ext?:string;
}

/**
 * Splits a URI into its base name and file extension, so a bookmark label can be generated
 * from the file name or folder name without the extension.
 *
 * It splits on the last dot, so it cannot tell a folder named `my.app` from a file: callers
 * that know which one they have should decide whether to use `ext` at all.
 * @param uri URI to process.
 * @returns Name parts.
 */
export function parseUriNameParts(uri:Uri):UriNameParts
{
  const result:UriNameParts={basename:''};

  let name = uri.fsPath.split(/[\\\/]/).pop()||'error';
  let pos = name.lastIndexOf('.');
  result.basename=name; 
  if (pos>0) //file
  {
    result.basename = name.substring(0,pos);
    result.ext = name.substring(pos+1);
  }
  //else //folder

  return result;
}