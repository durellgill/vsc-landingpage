import svgArrowRight from 'lucide-static/icons/arrow-right.svg?raw';
import svgEllipsis from 'lucide-static/icons/ellipsis.svg?raw';
import svgSquarePlus from 'lucide-static/icons/square-plus.svg?raw';
import svgTrash2 from 'lucide-static/icons/trash-2.svg?raw';
import svgEye from 'lucide-static/icons/eye.svg?raw';
import svgEyeClosed from 'lucide-static/icons/eye-closed.svg?raw';
import svgPlus from 'lucide-static/icons/plus.svg?raw';
import svgChevronUp from 'lucide-static/icons/chevron-up.svg?raw';
import svgChevronDown from 'lucide-static/icons/chevron-down.svg?raw';
import svgChevronRight from 'lucide-static/icons/chevron-right.svg?raw';
import svgLink2 from 'lucide-static/icons/link-2.svg?raw';
import svgCircleX from 'lucide-static/icons/circle-x.svg?raw';
import svgTextCursorInput from 'lucide-static/icons/text-cursor-input.svg?raw';
import svgLayoutGrid from 'lucide-static/icons/layout-grid.svg?raw';
import svgLayoutList from 'lucide-static/icons/layout-list.svg?raw';
import svgPaintbrush from 'lucide-static/icons/paintbrush.svg?raw';
import svgGripHorizontal from 'lucide-static/icons/grip-horizontal.svg?raw';
import svgGripVertical from 'lucide-static/icons/grip-vertical.svg?raw';
import svgFolder from 'lucide-static/icons/folder.svg?raw';
import svgFolderPlus from 'lucide-static/icons/folder-plus.svg?raw';
import svgBriefcaseBusiness from 'lucide-static/icons/briefcase-business.svg?raw';
import svgAppWindow from 'lucide-static/icons/app-window.svg?raw';
import svgFileSliders from 'lucide-static/icons/file-sliders.svg?raw';
import svgFileQuestion from 'lucide-static/icons/file-question.svg?raw';
import svgSquareMousePointer from 'lucide-static/icons/square-mouse-pointer.svg?raw';
import svgMove from 'lucide-static/icons/move.svg?raw';
import svgSettings from 'lucide-static/icons/settings.svg?raw';
import svgX from 'lucide-static/icons/x.svg?raw';
import svgAlignJustify from 'lucide-static/icons/align-justify.svg?raw';
import svgGitBranch from 'lucide-static/icons/git-branch.svg?raw';
import svgImage from 'lucide-static/icons/image.svg?raw';
import svgFolderInput from 'lucide-static/icons/folder-input.svg?raw';
import svgFolderGit2 from 'lucide-static/icons/folder-git-2.svg?raw';
import svgCode from 'lucide-static/icons/code.svg?raw';
import svgTerminal from 'lucide-static/icons/terminal.svg?raw';
import svgDatabase from 'lucide-static/icons/database.svg?raw';
import svgServer from 'lucide-static/icons/server.svg?raw';
import svgGlobe from 'lucide-static/icons/globe.svg?raw';
import svgPalette from 'lucide-static/icons/palette.svg?raw';
import svgBeaker from 'lucide-static/icons/beaker.svg?raw';
import svgBook from 'lucide-static/icons/book.svg?raw';
import svgBug from 'lucide-static/icons/bug.svg?raw';
import svgRocket from 'lucide-static/icons/rocket.svg?raw';
import svgCpu from 'lucide-static/icons/cpu.svg?raw';
import svgCloud from 'lucide-static/icons/cloud.svg?raw';
import svgPackage from 'lucide-static/icons/package.svg?raw';
import svgWrench from 'lucide-static/icons/wrench.svg?raw';
import svgFileText from 'lucide-static/icons/file-text.svg?raw';
import svgLayers from 'lucide-static/icons/layers.svg?raw';
import svgStar from 'lucide-static/icons/star.svg?raw';
import svgFlame from 'lucide-static/icons/flame.svg?raw';
import svgHouse from 'lucide-static/icons/house.svg?raw';
import svgBriefcase from 'lucide-static/icons/briefcase.svg?raw';
import svgCalendarDays from 'lucide-static/icons/calendar-days.svg?raw';
import svgBookmark from 'lucide-static/icons/bookmark.svg?raw';
import svgKeyRound from 'lucide-static/icons/key-round.svg?raw';
import svgLockKeyhole from 'lucide-static/icons/lock-keyhole.svg?raw';
import svgShield from 'lucide-static/icons/shield.svg?raw';
import svgHeart from 'lucide-static/icons/heart.svg?raw';
import svgMusic2 from 'lucide-static/icons/music-2.svg?raw';
import svgCamera from 'lucide-static/icons/camera.svg?raw';
import svgCoffee from 'lucide-static/icons/coffee.svg?raw';
import svgCommand from 'lucide-static/icons/command.svg?raw';
import svgTarget from 'lucide-static/icons/target.svg?raw';
import svgTrophy from 'lucide-static/icons/trophy.svg?raw';
import svgSparkles from 'lucide-static/icons/sparkles.svg?raw';
import svgZap from 'lucide-static/icons/zap.svg?raw';
import svgShoppingBag from 'lucide-static/icons/shopping-bag.svg?raw';
import svgRefreshCw from 'lucide-static/icons/refresh-cw.svg?raw';
import svgSearch from 'lucide-static/icons/search.svg?raw';
import svgFolderOpen from 'lucide-static/icons/folder-open.svg?raw';

/**
 * Strips the fixed 24x24 sizing off a raw Lucide SVG so the SCSS controls icon size.
 *
 * The webpack build used svg-inline-loader, which removed those attributes for us. Vite's
 * `?raw` import returns the file untouched, so the same normalisation happens here.
 * @param source Raw SVG file contents.
 * @returns SVG markup sized by CSS rather than by its own attributes.
 */
function icon(source:string):string
{
  return source.replace(/\s(?:width|height)="[^"]*"/g, '').trim();
}

//TODO: remove unused icons
/**
 * Collection of icons used in this extension. 
 * This collection object is iterated by HTML template parser
 * and each `key` will replace `${key}` in HTML template with the actual SVG source.
 * This way SVG icons can be injected into the html template file.
 */
export const icons=
{
  arrowRightIcon : icon(svgArrowRight), // return string of an SVG, styling+size in scss!
  ellipsis : icon(svgEllipsis), 
  squarePlus : icon(svgSquarePlus), 
  trash2 : icon(svgTrash2), 
  eye : icon(svgEye), 
  eyeClosed : icon(svgEyeClosed), 
  plus : icon(svgPlus), 
  chevronUp : icon(svgChevronUp),
  chevronDown : icon(svgChevronDown),
  chevronRight : icon(svgChevronRight),
  link : icon(svgLink2), 
  circleX : icon(svgCircleX), 
  textCursorInput : icon(svgTextCursorInput),
  layoutGrid : icon(svgLayoutGrid), 
  layoutList : icon(svgLayoutList),
  paintbrush : icon(svgPaintbrush),
  gripHorizontal : icon(svgGripHorizontal),
  gripVertical : icon(svgGripVertical),
  folder : icon(svgFolder),
  folderPlus : icon(svgFolderPlus),
  // briefcaseBusiness : icon(svgBriefcaseBusiness),
  appWindow : icon(svgAppWindow),
  fileSliders : icon(svgFileSliders),
  fileQuestion : icon(svgFileQuestion),
  
  squareMousePointer : icon(svgSquareMousePointer),
  move : icon(svgMove),
  settings : icon(svgSettings),

  clear : icon(svgX),

  alignJustify : icon(svgAlignJustify),
  gitBranch : icon(svgGitBranch),
  image : icon(svgImage),
  folderInput : icon(svgFolderInput), // toolbar button for the icon picker
  refreshCw : icon(svgRefreshCw),

  //--- glyphs -----------------------------------------------------------------
  // User-selectable bookmark icons. The key after `glyph-` is what gets stored in
  // LandingPageProject.glyph, so renaming one orphans existing bookmarks - add, don't rename.
  'glyph-folder' : icon(svgFolder),
  'glyph-repo' : icon(svgFolderGit2),
  'glyph-code' : icon(svgCode),
  'glyph-terminal' : icon(svgTerminal),
  'glyph-database' : icon(svgDatabase),
  'glyph-server' : icon(svgServer),
  'glyph-globe' : icon(svgGlobe),
  'glyph-design' : icon(svgPalette),
  'glyph-lab' : icon(svgBeaker),
  'glyph-docs' : icon(svgBook),
  'glyph-bug' : icon(svgBug),
  'glyph-rocket' : icon(svgRocket),
  'glyph-cpu' : icon(svgCpu),
  'glyph-cloud' : icon(svgCloud),
  'glyph-package' : icon(svgPackage),
  'glyph-tools' : icon(svgWrench),
  'glyph-notes' : icon(svgFileText),
  'glyph-layers' : icon(svgLayers),
  'glyph-star' : icon(svgStar),
  'glyph-flame' : icon(svgFlame),
  'glyph-home' : icon(svgHouse),
  'glyph-briefcase' : icon(svgBriefcase),
  'glyph-calendar' : icon(svgCalendarDays),
  'glyph-bookmark' : icon(svgBookmark),
  'glyph-key' : icon(svgKeyRound),
  'glyph-lock' : icon(svgLockKeyhole),
  'glyph-shield' : icon(svgShield),
  'glyph-heart' : icon(svgHeart),
  'glyph-music' : icon(svgMusic2),
  'glyph-camera' : icon(svgCamera),
  'glyph-coffee' : icon(svgCoffee),
  'glyph-command' : icon(svgCommand),
  'glyph-target' : icon(svgTarget),
  'glyph-trophy' : icon(svgTrophy),
  'glyph-sparkles' : icon(svgSparkles),
  'glyph-zap' : icon(svgZap),
  'glyph-shop' : icon(svgShoppingBag),
  search : icon(svgSearch),
  folderOpen : icon(svgFolderOpen),
  folderGit : icon(svgFolderGit2)

};
