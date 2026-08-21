/** How a group lays its bookmarks out. Persisted, so these strings are user data. */
export type Layout = 'list'|'grid'|'compact';

export type Target = { guid:string; x:number; y:number } | null;
