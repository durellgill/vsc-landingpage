/**
 * Types shared across the webview modules.
 *
 * They live apart from any one of them because `Layout` is read by the drag geometry, the
 * components and `App` alike, and a type that three modules need is not owned by any of them.
 */

/** How a group lays its bookmarks out. Persisted, so these strings are user data. */
export type Layout = 'list'|'grid'|'compact';

/** What an open menu or palette is acting on, and where it was summoned. */
export type Target = { guid:string; x:number; y:number } | null;
