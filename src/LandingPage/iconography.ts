//TODO: remove unused icons
/**
 * Collection of icons used in this extension. 
 * This collection object is iterated by HTML template parser
 * and each `key` will replace `${key}` in HTML template with the actual SVG source.
 * This way SVG icons can be injected into the html template file.
 */
export const icons=
{
  arrowRightIcon : require('lucide-static/icons/arrow-right.svg'), // return string of an SVG, styling+size in scss!
  ellipsis : require('lucide-static/icons/ellipsis.svg'), 
  squarePlus : require('lucide-static/icons/square-plus.svg'), 
  trash2 : require('lucide-static/icons/trash-2.svg'), 
  eye : require('lucide-static/icons/eye.svg'), 
  eyeClosed : require('lucide-static/icons/eye-closed.svg'), 
  plus : require('lucide-static/icons/plus.svg'), 
  chevronUp : require('lucide-static/icons/chevron-up.svg'),
  chevronDown : require('lucide-static/icons/chevron-down.svg'),
  link : require('lucide-static/icons/link-2.svg'), 
  circleX : require('lucide-static/icons/circle-x.svg'), 
  textCursorInput : require('lucide-static/icons/text-cursor-input.svg'),
  layoutGrid : require('lucide-static/icons/layout-grid.svg'), 
  layoutList : require('lucide-static/icons/layout-list.svg'),
  paintbrush : require('lucide-static/icons/paintbrush.svg'),
  gripHorizontal : require('lucide-static/icons/grip-horizontal.svg'),
  gripVertical : require('lucide-static/icons/grip-vertical.svg'),
  folder : require('lucide-static/icons/folder.svg'),
  folderPlus : require('lucide-static/icons/folder-plus.svg'),
  // briefcaseBusiness : require('lucide-static/icons/briefcase-business.svg'),
  appWindow : require('lucide-static/icons/app-window.svg'),
  fileSliders : require('lucide-static/icons/file-sliders.svg'),
  fileQuestion : require('lucide-static/icons/file-question.svg'),
  
  squareMousePointer : require('lucide-static/icons/square-mouse-pointer.svg'),
  move : require('lucide-static/icons/move.svg'),
  settings : require('lucide-static/icons/settings.svg'),

  clear : require('lucide-static/icons/x.svg'),

  alignJustify : require('lucide-static/icons/align-justify.svg'),
  gitBranch : require('lucide-static/icons/git-branch.svg'),
  image : require('lucide-static/icons/image.svg'),
  folderInput : require('lucide-static/icons/folder-input.svg'), // toolbar button for the icon picker

  //--- glyphs -----------------------------------------------------------------
  // User-selectable bookmark icons. The key after `glyph-` is what gets stored in
  // LandingPageProject.glyph, so renaming one orphans existing bookmarks - add, don't rename.
  'glyph-folder' : require('lucide-static/icons/folder.svg'),
  'glyph-repo' : require('lucide-static/icons/folder-git-2.svg'),
  'glyph-code' : require('lucide-static/icons/code.svg'),
  'glyph-terminal' : require('lucide-static/icons/terminal.svg'),
  'glyph-database' : require('lucide-static/icons/database.svg'),
  'glyph-server' : require('lucide-static/icons/server.svg'),
  'glyph-globe' : require('lucide-static/icons/globe.svg'),
  'glyph-design' : require('lucide-static/icons/palette.svg'),
  'glyph-lab' : require('lucide-static/icons/beaker.svg'),
  'glyph-docs' : require('lucide-static/icons/book.svg'),
  'glyph-bug' : require('lucide-static/icons/bug.svg'),
  'glyph-rocket' : require('lucide-static/icons/rocket.svg'),
  'glyph-cpu' : require('lucide-static/icons/cpu.svg'),
  'glyph-cloud' : require('lucide-static/icons/cloud.svg'),
  'glyph-package' : require('lucide-static/icons/package.svg'),
  'glyph-tools' : require('lucide-static/icons/wrench.svg'),
  'glyph-notes' : require('lucide-static/icons/file-text.svg'),
  'glyph-layers' : require('lucide-static/icons/layers.svg'),
  'glyph-star' : require('lucide-static/icons/star.svg'),
  'glyph-flame' : require('lucide-static/icons/flame.svg'),
  'glyph-home' : require('lucide-static/icons/house.svg'),
  'glyph-briefcase' : require('lucide-static/icons/briefcase.svg'),
  'glyph-calendar' : require('lucide-static/icons/calendar-days.svg'),
  'glyph-bookmark' : require('lucide-static/icons/bookmark.svg'),
  'glyph-key' : require('lucide-static/icons/key-round.svg'),
  'glyph-lock' : require('lucide-static/icons/lock-keyhole.svg'),
  'glyph-shield' : require('lucide-static/icons/shield.svg'),
  'glyph-heart' : require('lucide-static/icons/heart.svg'),
  'glyph-music' : require('lucide-static/icons/music-2.svg'),
  'glyph-camera' : require('lucide-static/icons/camera.svg'),
  'glyph-coffee' : require('lucide-static/icons/coffee.svg'),
  'glyph-command' : require('lucide-static/icons/command.svg'),
  'glyph-target' : require('lucide-static/icons/target.svg'),
  'glyph-trophy' : require('lucide-static/icons/trophy.svg'),
  'glyph-sparkles' : require('lucide-static/icons/sparkles.svg'),
  'glyph-zap' : require('lucide-static/icons/zap.svg'),
  'glyph-shop' : require('lucide-static/icons/shopping-bag.svg'),
  search : require('lucide-static/icons/search.svg'),
  folderOpen : require('lucide-static/icons/folder-open.svg'),
  folderGit : require('lucide-static/icons/folder-git-2.svg')

};
