const vscode = acquireVsCodeApi();

// const state = 
// {

// };

function diag(msg)
{
  console.log('💎',msg);
  //document.getElementById('pseudoconsole').innerText = msg;
}

function alert(msg)
{
  vscode.postMessage({command:'test',text:'🐕 alerting: '+msg});
}

const typesvg_folder = '${folder}';
const typesvg_workspace = '${fileSliders}';
const typesvg_question = '${fileQuestion}';

let prototypes = 
{
  group:null,
  project:null
};

function initPrototypes()
{        
  prototypes.group= document.querySelector('div[data-prototype].group');
  prototypes.project= prototypes.group.querySelector('div[data-prototype].project');
}


function addGroup(landingPageGroup)
{
  let newGroup=prototypes.group.cloneNode(true);
  delete newGroup.dataset['prototype'];
  newGroup.dataset['guid']=landingPageGroup.guid;
  
  // for(const labeled of newGroup.querySelectorAll('[data-field="group.label"]'))
  //   labeled.innerText = landingPageGroup.label;

  prototypes.group.parentElement.appendChild( newGroup );

  //landingPageGroup.projects.forEach((landingPageProject)=>{addProject(landingPageProject,newGroup)});      
  return newGroup;
}

function addProject(landingPageProject, elGroup)
{
  let newPro=prototypes.project.cloneNode(true);
  delete newPro.dataset['prototype'];
  newPro.dataset['guid']=landingPageProject.guid;
  
  // for(const labeled of newPro.querySelectorAll('[data-field="project.label"]'))
  //   labeled.innerText = landingPageProject.label;

  
  // let svg = typesvg_folder;
  // if (Math.random()>0.499) svg = typesvg_workspace;

  // for(const labeled of newPro.querySelectorAll('[data-field="project.typesvg"]'))
  //   labeled.innerHTML = svg;

  elGroup.querySelector('.projects').appendChild( newPro );
  // Do NOT call applyFilter() here. It walks every project and group in the document, so
  // calling it once per inserted bookmark made a full sync quadratic. The sync handler
  // calls applyFilter() once when it is done.
  return newPro;
}

function createBookmark(event, pickFolder)
{
  const guidProvider = event.target.closest('[data-guid]');
  if (guidProvider)
  {
    guidProvider.querySelector('.group-composer')?.classList.add('hidden');
    vscode.postMessage({command:'createBookmark',guid:guidProvider.dataset['guid'],pickFolder:pickFolder});
  }
  else {alert('Cannot create bookmark, closest guid not found.');}
}

/** Opens the destination-specific add choices directly beneath a group header. */
function toggleGroupComposer(event)
{
  event.stopPropagation();
  const group = event.target.closest('.group:not([data-prototype])');
  if (!group) {return;}
  const composer = group.querySelector('.group-composer');
  const willOpen = composer.classList.contains('hidden');
  for (const other of document.querySelectorAll('.group-composer')) {other.classList.add('hidden');}
  if (willOpen) {composer.classList.remove('hidden');}
}

/** Closes the local add choices without affecting the group or any bookmarks. */
function closeGroupComposer(event)
{
  event.stopPropagation();
  event.target.closest('.group-composer')?.classList.add('hidden');
}

/** Requests a persisted one-step move for a user-created group. */
function moveGroup(event, direction)
{
  event.stopPropagation();
  const group = event.target.closest('.group:not([data-prototype])');
  if (group) {vscode.postMessage({command:'moveGroup', guid:group.dataset['guid'], direction});}
}

function createGroup()
{
  // console.log('createGroup()');
  vscode.postMessage({command:'createGroup'}); //raises syncModel with forceRebuild:true
}

/**
 * Renames a group directly from its heading.
 * @param {MouseEvent} event - Double-click on a group title.
 */
function renameGroup(event)
{
  event.preventDefault();
  event.stopPropagation();
  const group = event.target.closest('.group:not([data-prototype])');
  if (group && !group.classList.contains('sealed'))
  {
    openMenu(event);
    startRename();
  }
}

function modalHide(event)
{
  // console.log('modal hide',event);
  // querySelectorAll, not querySelector: there is a paint modal and an icon modal.
  for (const modal of document.querySelectorAll('.modal'))
  {
    modal.classList.add('hidden');
  }
}

//--- colour and icon ----------------------------------------------------------
// Both pickers act on `menuTarget`, the row whose menu was opened. There is no "currently
// selected colour" any more - you pick the value for one bookmark at the moment you need it.

/** Every selectable glyph, keyed by name. Filled from the picker markup on startup. */
const GLYPHS = {};
const TYPE_SHADES = {folder:'blue', workspace:'purple', file:'teal'};
const GROUP_SHADES = ['purple','teal','orange','pink','blue'];

function initGlyphs()
{
  for (const el of document.querySelectorAll('.glyphpalette button[data-glyph]'))
  {
    const key = el.dataset['glyph'];
    if (key) {GLYPHS[key] = el.innerHTML;}
  }
}

/**
 * Resolves which icon a bookmark shows: the user's chosen glyph if it has one, otherwise
 * the icon implied by its file/folder/workspace type.
 * @param {object} landingPageProject - Model entry for the bookmark.
 * @returns {string} SVG source.
 */
function iconForProject(landingPageProject)
{
  if (landingPageProject.glyph && GLYPHS[landingPageProject.glyph])
  {
    return GLYPHS[landingPageProject.glyph];
  }
  if (landingPageProject.icon === 'folder') {return typesvg_folder;}
  if (landingPageProject.icon === 'workspace') {return typesvg_workspace;}
  return typesvg_question;
}

/** Gives uncustomized groups a stable color while reserving neutral grey for generated recents. */
function shadeForGroup(landingPageGroup)
{
  if (landingPageGroup.shade) {return landingPageGroup.shade;}
  if (landingPageGroup.guid==='@vsc-mru') {return 'gray';}
  let hash = 0;
  for (const char of landingPageGroup.guid) {hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;}
  return GROUP_SHADES[hash % GROUP_SHADES.length];
}

function selectPaint(event)
{
  const shade = event.target.dataset['shade'];
  if (menuTarget)
  {
    menuTarget.dataset['shade'] = shade;
    vscode.postMessage({command:'patch', guid:menuTarget.dataset['guid'], field:'shade', value:shade});
  }
  modalHide();
}

function selectGlyph(event)
{
  const key = event.target.closest('[data-glyph]').dataset['glyph'];
  if (menuTarget)
  {
    if (key)
    {
      for (const el of menuTarget.querySelectorAll('[data-field$=".typesvg"]'))
      {
        el.innerHTML = GLYPHS[key];
      }
    }
    // Clearing falls back to the type icon, which only the extension knows - the resulting
    // syncModel redraws it.
    vscode.postMessage({command:'patch', guid:menuTarget.dataset['guid'], field:'glyph', value:key});
  }
  modalHide();
}

//--- clicking ------------------------------------------------------------------
// No tool modes and no drag: a click opens, everything else is on the row menu.
// Bookmarks are moved between groups with "Move to group", which asks the extension to
// show a quick pick - see communication.ts.

/** Set while the action menu is open, so the click that dismisses it does not also open a row. */
let suppressClick=false;

//--- layouts -------------------------------------------------------------------

/** Available bookmark layouts, in the order the layout button cycles through them. */
const LAYOUTS = ['list','grid','compact'];

/** Button icon and tooltip per layout. The icon shows the layout you are currently in. */
const LAYOUT_UI =
{
  list:    {icon:'${layoutList}',  title:'List view - click to change layout'},
  grid:    {icon:'${layoutGrid}',  title:'Card view - click to change layout'},
  compact: {icon:'${alignJustify}',title:'Compact view - click to change layout'}
};

function setLayout(event, layoutClass, elGroup=undefined, persist=true)
{
  if (!elGroup) {elGroup = event.target.closest('[data-guid]');}
  if (!LAYOUTS.includes(layoutClass)) {layoutClass = 'list';}

  let elProjects = elGroup.querySelector('.projects');
  if (elProjects)
  {
    elProjects.classList.remove(...LAYOUTS);
    elProjects.classList.add(layoutClass);

    // Keep the toggle button showing the layout this group is in.
    const elButton = elGroup.querySelector('[data-role="layout"]');
    if (elButton)
    {
      elButton.innerHTML = LAYOUT_UI[layoutClass].icon;
      elButton.setAttribute('title', LAYOUT_UI[layoutClass].title);
      elButton.setAttribute('aria-label', LAYOUT_UI[layoutClass].title);
      elButton.dataset['layout'] = layoutClass;
    }

    // Layout itself cannot transition, so give the newly arranged bookmarks one restrained
    // entrance beat. It is removed before the next change so the animation can replay.
    elProjects.classList.remove('layout-changing');
    void elProjects.offsetWidth;
    elProjects.classList.add('layout-changing');

    if (persist)
    {
      vscode.postMessage({command:'patch',guid:elGroup.dataset['guid'], field:'layout', value:layoutClass});
    }
  }
  else { console.warn('elGroup nil',event,layoutClass,elGroup, elProjects);}
}

function toggleLayout(event)
{
  event.stopPropagation();
  setLayoutNext(event.target.closest('[data-guid]'));
}

/**
 * Advances one group to the next layout in {@link LAYOUTS}.
 * @param {Element} elGroup - The group to change.
 */
function setLayoutNext(elGroup)
{
  const elProjects = elGroup.querySelector('.projects');
  const current = LAYOUTS.find(l => elProjects.classList.contains(l)) || 'list';
  setLayout(undefined, LAYOUTS[(LAYOUTS.indexOf(current)+1) % LAYOUTS.length], elGroup);
}


//--- context menu -------------------------------------------------------------
// One menu serves bookmarks and groups; irrelevant entries are hidden via data-kind.
// Opened by the row's "..." button or by right-clicking the row.

/** Element the menu is currently acting on. */
let menuTarget = null;

function menuIsHidden()
{
  return document.getElementById('ctxmenu').classList.contains('hidden');
}

function menuHide()
{
  const menu = document.getElementById('ctxmenu');
  menu.classList.add('hidden');
  delete menu.dataset['confirmingRemove'];
  delete menu.dataset['confirmingHideRecent'];
  delete menu.dataset['renaming'];
}

/**
 * Opens the action menu for whichever bookmark or group the event happened in.
 * @param {Event} event - Click on the "..." button, or a contextmenu event on the row.
 */
function openMenu(event)
{
  event.preventDefault();
  event.stopPropagation();

  const target = event.target.closest('[data-guid]:not([data-prototype])');
  if (!target) {return;}

  menuTarget = target;
  const menu = document.getElementById('ctxmenu');
  menu.dataset['kind'] = target.classList.contains('group') ? 'group' : 'project';
  menu.dataset['sealed'] = target.closest('.sealed') ? 'yes' : 'no';
  delete menu.dataset['confirmingRemove'];
  delete menu.dataset['confirmingHideRecent'];
  delete menu.dataset['renaming'];
  tidySeparators(menu);
  menu.classList.remove('hidden');

  // Place at the pointer, then pull back inside the viewport if it would overflow.
  const box = menu.getBoundingClientRect();
  const x = ('clientX' in event && event.clientX) ? event.clientX : target.getBoundingClientRect().right;
  const y = ('clientY' in event && event.clientY) ? event.clientY : target.getBoundingClientRect().top;
  menu.style.left = Math.min(x, window.innerWidth  - box.width  - 8) + 'px';
  menu.style.top  = Math.min(y, window.innerHeight - box.height - 8) + 'px';
}

/**
 * Hides separators that no longer divide anything.
 *
 * Entries are shown/hidden by CSS per target type, which can leave a separator at the top or
 * bottom of the menu, or two in a row. A bookmark in the sealed `Recent` group hid Remove,
 * for example, and left a trailing divider with nothing under it.
 *
 * @param {Element} menu - The menu element, after data-kind/data-sealed are set.
 */
function tidySeparators(menu)
{
  const items = [...menu.children];
  const visible = (el) => !el.classList.contains('ctxsep') && getComputedStyle(el).display !== 'none';

  for (const sep of menu.querySelectorAll('.ctxsep'))
  {
    const i = items.indexOf(sep);
    const before = items.slice(0, i).some(visible);
    const after  = items.slice(i + 1).some(visible);
    sep.classList.toggle('hidden', !(before && after));
  }

  // Collapse runs: if the next visible thing after this separator is another separator,
  // this one is redundant.
  let lastWasSep = true;
  for (const el of items)
  {
    if (el.classList.contains('hidden') || getComputedStyle(el).display === 'none') {continue;}
    const isSep = el.classList.contains('ctxsep');
    if (isSep && lastWasSep) {el.classList.add('hidden');}
    else {lastWasSep = isSep;}
  }
}

/**
 * Runs the chosen menu entry against {@link menuTarget}.
 * @param {Event} event - Click on a menu button.
 */
function menuAction(event)
{
  const act = event.target.closest('[data-act]').dataset['act'];
  const el = menuTarget;
  if (!el) {return;}
  const guid = el.dataset['guid'];
  const menu = document.getElementById('ctxmenu');

  if (act==='remove')
  {
    menu.dataset['confirmingRemove'] = 'yes';
    tidySeparators(menu);
    return;
  }

  if (act==='hiderecent')
  {
    menu.dataset['confirmingHideRecent'] = 'yes';
    tidySeparators(menu);
    return;
  }

  if (act==='rename')
  {
    startRename();
    return;
  }

  if (act==='renameconfirm')
  {
    const value = menu.querySelector('[data-role="rename-input"]').value.trim();
    if (!value)
    {
      menu.querySelector('[data-role="rename-input"]').focus();
      return;
    }
    menuHide();
    vscode.postMessage({command:'rename', guid, value});
    return;
  }

  if (act==='cancelrename')
  {
    menuHide();
    return;
  }

  menuHide();

  switch(act)
  {
    case 'open':      vscode.postMessage({command:'open', guid}); break;
    case 'removeconfirm': vscode.postMessage({command:'remove', guid}); break;
    case 'hiderecentconfirm': vscode.postMessage({command:'hideRecent', guid}); break;
    case 'cancelremove': break;
    case 'addfile':   vscode.postMessage({command:'createBookmark', guid, pickFolder:false}); break;
    case 'addfolder': vscode.postMessage({command:'createBookmark', guid, pickFolder:true}); break;
    case 'movetogroup': vscode.postMessage({command:'moveToGroup', guid}); break;
    case 'restorerecents': vscode.postMessage({command:'restoreHiddenRecents'}); break;
    case 'color':     showPicker('.modal:not(.glyphmodal)', '.palette', event); break;
    case 'icon':      showPicker('.glyphmodal', '.glyphpalette', event); break;
  }
}

/** Opens the rename editor directly inside the action menu. */
function startRename()
{
  const menu = document.getElementById('ctxmenu');
  const field = menu.querySelector('[data-role="rename-input"]');
  const label = menuTarget?.querySelector('[data-field$=".label"]')?.innerText || '';
  field.value = label;
  menu.dataset['renaming'] = 'yes';
  tidySeparators(menu);
  requestAnimationFrame(() => { field.focus(); field.select(); });
}

/** Supports the normal Enter/Escape expectations inside the inline rename editor. */
function renameKeydown(event)
{
  if (event.key==='Enter')
  {
    event.preventDefault();
    event.target.closest('.ctxmenu').querySelector('[data-act="renameconfirm"]').click();
  }
  else if (event.key==='Escape')
  {
    event.preventDefault();
    menuHide();
  }
}

/**
 * Shows one of the pickers near the pointer. menuTarget is kept, so the chosen swatch or
 * glyph applies to the row the menu was opened on.
 */
function showPicker(modalSelector, boxSelector, event)
{
  const modal = document.querySelector(modalSelector);
  modal.classList.remove('hidden');
  const box = modal.querySelector(boxSelector);
  const r = box.getBoundingClientRect();
  box.style.left = Math.min(event.clientX, window.innerWidth  - r.width  - 8) + 'px';
  box.style.top  = Math.min(event.clientY, window.innerHeight - r.height - 8) + 'px';
}

function openProject(event)
{
  if (suppressClick) {suppressClick=false; return;} //this click dismissed the menu
  if (!menuIsHidden()) {return;}
  const guidProvider = event.target.closest('[data-guid]:not([data-prototype])');
  if (!guidProvider || guidProvider.classList.contains('group')) {return;}
  if (event.target.closest('button')) {return;}
  vscode.postMessage({command:'open', guid:guidProvider.dataset['guid']});
}

let model/*:LandingPageModel*/={};

window.addEventListener('message', event => 
  {
  const message = event.data; // The JSON data our extension sent
  // diag('got message! '+JSON.stringify(message));

  switch (message.command) 
  {
    case 'syncModel': 
      if (message.forceRebuild===true)
      {
        for(let element of document.querySelectorAll('.group:not([data-prototype])'))
        {
          element.remove();
        }
      }
      // GUID -> dom element. A Map instead of Array.find(), which turned the nested
      // group/project walk into an O(n^2) scan over every element on the page.
      let elGUIDs = new Map();
      for(const el of document.querySelectorAll('[data-guid]:not([data-prototype])'))
      {
        elGUIDs.set(el.dataset['guid'], el);
      }
      let guidsInModel = new Set(); //collecting all guids present in model (finds removed ones later)
      for(const landingPageGroup of message.model.groups)
      {
        try
        {
          guidsInModel.add(landingPageGroup.guid);

          let elGroup = elGUIDs.get(landingPageGroup.guid);
          if (elGroup===undefined) //no html for this group yet, create
          {
            elGroup = addGroup(landingPageGroup);
            elGUIDs.set(landingPageGroup.guid, elGroup);
          }
          
          //--- update/sync html and data model
          for(const labeled of elGroup.querySelectorAll('[data-field="group.label"]'))
          {
            labeled.innerText = landingPageGroup.label;
          }
          for(const composerLabel of elGroup.querySelectorAll('[data-field="group.composerLabel"]'))
          {
            composerLabel.innerText = landingPageGroup.label || 'this group';
          }
          for(const counted of elGroup.querySelectorAll('[data-field="group.count"]'))
          {
            counted.innerText = landingPageGroup.projects.length || '';
          }
          elGroup.dataset['shade'] = shadeForGroup(landingPageGroup);
          for(const icon of elGroup.querySelectorAll('[data-field="group.typesvg"]'))
          {
            icon.innerHTML = GLYPHS[landingPageGroup.glyph] || GLYPHS.folder;
          }

          let isSealed = landingPageGroup.guid==='@vsc-mru'; //auto-generated list may be locked
          if (isSealed) 
          {
            elGroup.classList.add('sealed');
          }
          const userGroups = message.model.groups.filter(group => group.guid!=='@vsc-mru');
          const userGroupIndex = userGroups.indexOf(landingPageGroup);
          const moveUp = elGroup.querySelector('[data-role="move-up"]');
          const moveDown = elGroup.querySelector('[data-role="move-down"]');
          if (moveUp) {moveUp.disabled = isSealed || userGroupIndex<=0;}
          if (moveDown) {moveDown.disabled = isSealed || userGroupIndex===userGroups.length-1;}

          // persist:false - this is rendering existing state, not a user change.
          setLayout(undefined,landingPageGroup.layout||'list',elGroup,false);

          //--
          
          for(const landingPageProject of landingPageGroup.projects)
          {
            guidsInModel.add(landingPageProject.guid);

            let elProject = elGUIDs.get(landingPageProject.guid);
            if (elProject===undefined) //no html for this project yet, create
            {
              elProject = addProject(landingPageProject, elGroup);
              elGUIDs.set(landingPageProject.guid, elProject);
            }

            //--- update/sync html and data model        
            for(const labeled of elProject.querySelectorAll('[data-field="project.label"]'))
            {
              labeled.innerText = landingPageProject.label;
            }
            
            const svg = iconForProject(landingPageProject);
            for(const labeled of elProject.querySelectorAll('[data-field="project.typesvg"]'))
            {
              labeled.innerHTML = svg;
            }

            const type = landingPageProject.icon || 'file';
            elProject.dataset['shade'] = landingPageProject.shade || TYPE_SHADES[type];
            elProject.dataset['kind'] = type;

            const readablePath = landingPageProject.path ? decodeURI(landingPageProject.path).replace(/^file:\/\//,'') : '';
            elProject.setAttribute('title', readablePath);
            for(const elPath of elProject.querySelectorAll('[data-field="project.path"]'))
            {
              // Show the containing directory, not the full URI - the full path is in the tooltip.
              const parent = readablePath.substring(0, readablePath.lastIndexOf('/'));
              elPath.innerText = parent;
            }

          }   
        }catch(error) {console.error(error);}              
      }
      //remove DOM elements which are no longer in current model:
      elGUIDs.forEach((el, guid)=>{
        if (!guidsInModel.has(guid))
        {
          el.remove();
        }
      });
      if (message.model.viewState?.recentFilterText)
      { 
        _recentFilterText = message.model.viewState.recentFilterText; 
        document.getElementById('filterinput').value = message.model.viewState.recentFilterText;
      }      
      applyFilter(); 
      break;
    case 'setFocusToFilterInput':
      const input = document.querySelector('#filterinput');
      input?.focus();
      break;
    default:
      console.warn('Unknown command',message.command);      
  }
});

function openSettings()
{
  vscode.postMessage({command:'openSettings'});
}

function openFolder()
{
  vscode.postMessage({command:'openFolder'});
}

/**
 * Hands the URL from the clone field to the extension, which delegates to VS Code's
 * built-in `git.clone`. The required webview field keeps the text entry beside its action.
 * @param {Event} event - Submit event of the clone form.
 */
function cloneRepository(event)
{
  event?.preventDefault();
  const input = document.getElementById('cloneinput');
  const url = input.value.trim();
  if (!url) {input.focus(); return;}
  vscode.postMessage({command:'cloneRepository', url});
  input.value = '';
}

function focusCloneInput()
{
  document.getElementById('cloneinput')?.focus();
}

function clearFilter()
{
  const input = document.getElementById('filterinput');
  input.value = '';
  applyFilter('');
  input.focus();
}

let _recentFilterText='';

/**
 * Refresh the view filter any time.
 * @param {string|Event|undefined} eventOrText - The input event of the textfield or the literal filter text as string. If omitted, the recently applied filter text is used again.
 */
function applyFilter(eventOrText)
{
  let filtertext='';
  if (eventOrText===undefined) {filtertext=_recentFilterText;}
  else
  {
    if (typeof eventOrText === 'string') {filtertext = eventOrText;}
    else {filtertext = eventOrText.target.value;}
    _recentFilterText = filtertext;
    vscode.postMessage({command:'setViewState', field:'recentFilterText', value:filtertext});
  }

  const needle = filtertext.toLowerCase();
  let anyVisible = false;

  for(let elProject of document.querySelectorAll('.project:not([data-prototype])'))
  {
    // Match against the label only. Using innerText would also match the path line, so a
    // filter like "src" would match nearly every bookmark.
    const label = elProject.querySelector('[data-field="project.label"]')?.innerText || '';
    const matches = label.toLowerCase().includes(needle);
    elProject.classList.toggle('hidden-by-filter', !matches);
    if (matches) {anyVisible = true;}
  }

  // Collapse groups the filter emptied, so the page is not a list of bare headings.
  //
  // Only while a filter is actually running. A group with no bookmarks at all must stay
  // visible - otherwise a freshly created group disappears the instant it is made, and
  // there is no way to add anything to it.
  for(let elGroup of document.querySelectorAll('.group:not([data-prototype])'))
  {
    const total = elGroup.querySelectorAll('.project:not([data-prototype])').length;
    const visible = elGroup.querySelectorAll('.project:not([data-prototype]):not(.hidden-by-filter)').length;
    elGroup.classList.toggle('filtered-out', needle.length>0 && total>0 && visible===0);
  }

  updatePlaceholders(anyVisible, needle);
}

/**
 * Shows the first-run placeholder when there is nothing bookmarked at all, or the
 * no-match placeholder when a filter hides everything. Only one can be visible.
 * @param {boolean} anyVisible - Whether at least one bookmark survived the current filter.
 * @param {string} needle - The active filter text, lowercased.
 */
function updatePlaceholders(anyVisible, needle)
{
  const total = document.querySelectorAll('.project:not([data-prototype])').length;
  const isEmpty = total === 0;
  const isNoMatch = !isEmpty && !anyVisible && needle.length > 0;

  document.getElementById('emptystate').classList.toggle('hidden', !isEmpty);
  document.getElementById('nomatchstate').classList.toggle('hidden', !isNoMatch);
  document.querySelector('.content').classList.toggle('hidden', isEmpty);

  if (isNoMatch)
  {
    document.getElementById('nomatchterm').innerText = document.getElementById('filterinput').value;
  }
}


(function()
{
  initPrototypes();
  initGlyphs();

  // Wired here rather than inline so the menu and the open-on-click can coordinate.
  document.addEventListener('click', openProject);

  // Right-click anywhere on a bookmark or group opens the same menu as the "..." button.
  document.addEventListener('contextmenu', (event) => {
    if (event.target.closest('[data-guid]:not([data-prototype])')) {openMenu(event);}
  });

  // Any click outside the menu dismisses it, as does Escape.
  document.addEventListener('mousedown', (event) => {
    if (!menuIsHidden() && !event.target.closest('#ctxmenu')) {menuHide();}
  }, true);
  document.addEventListener('keydown', (event) => {
    if (event.key==='Escape') {menuHide(); modalHide();}
  });

  // diag('🐕 docready!');
  vscode.postMessage({command:'documentReady'});
}());
