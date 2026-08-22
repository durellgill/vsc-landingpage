export interface LandingPageModel
{
  groups:LandingPageGroup[];

  // 🔺 Reminder: also review communication.ts:resetModel() if LandingPageModel is changed.
}

interface LandingPageItem
{
  guid:string;
}

export interface LandingPageGroup extends LandingPageItem
{  
  label:string;
  shade?:LandingPageProject['shade'];
  glyph?:string;
  projects:LandingPageProject[];

  /**
   * `list` uses full-width rows, `grid` uses tiles, and `compact` uses a dense wrapping layout.
   */
  layout?:'grid'|'list'|'compact';

  /**
   * Collapse state persists across reloads and windows. Filtering may temporarily reveal a collapsed group without changing that stored state.
   */
  collapsed?:boolean;

  /**
   * Hidden entries for Recent group only.
   */
  hidden?:LandingPageProject[];

  /**
   * Whether the recently-opened history holds more entries than this group is showing. Drives the
   * `Show more` control, and is never persisted - it describes the current page, not the model.
   */
  hasMore?:boolean;
}

export interface LandingPageProject extends LandingPageItem
{
  label:string;
  path?:string;
  icon?:'file'|'folder'|'workspace'; // omitted/default = 'file'
  /**
   * Stores the suffix of a `glyph-*` key. When absent, presentation derives the icon from the bookmark type.
   */
  glyph?:string;
  pinned?:boolean;
  shade?:'red'|'orange'|'yellow'|'green'|'teal'|'pink'|'purple'|'blue'|'cyan'|'gray'|'silver'|'brown'|'white'|'black';
}


export interface ItemLocation
{
  target:LandingPageGroup|LandingPageProject;
  model:LandingPageModel;
  /**
   * Present only for bookmarks; absence identifies a group result.
   */
  ownerGroup?:LandingPageGroup;
}

export function findItemByGuid(guid:string|undefined, inModel:LandingPageModel):ItemLocation|null
{
  if (!guid){ return null;}
  if (guid.length>0)
  {
    for(const group of inModel.groups)
    {
      if (group.guid===guid)
      {
        return {target:group, model:inModel};
      }
      for(const project of group.projects)
      {
        if (project.guid===guid) 
        {
          return {target:project, model:inModel, ownerGroup:group};
        }
      }
    }
  }
  return null;
}
