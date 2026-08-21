import { Uri } from "vscode";

export interface UriNameParts
{
  basename:string;
  ext?:string;
}

/**
 * Splits on the last non-leading dot, but callers must not use the result to infer whether a dotted URI names a file or folder.
 */
export function parseUriNameParts(uri:Uri):UriNameParts
{
  const result:UriNameParts={basename:''};

  let name = uri.fsPath.split(/[\\\/]/).pop()||'error';
  let pos = name.lastIndexOf('.');
  result.basename=name; 
  if (pos>0)
  {
    result.basename = name.substring(0,pos);
    result.ext = name.substring(pos+1);
  }
  return result;
}
