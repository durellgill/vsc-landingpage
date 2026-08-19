#!/usr/bin/env node
/**
 * Motion regression check.
 *
 * Fourteen checks, 25 assertions. Every one covers a *behaviour* rather than a value, which is
 * why a build, a typecheck and a lint all pass through them happily.
 *
 * Entries 1 to 11 are bugs that actually shipped here, each reduced to the smallest assertion
 * that would have caught it. Entries 12 to 14 guard a rule that has not been broken yet.
 *
 * Do not delete a check because its bug is fixed - that is what makes it a regression check.
 * The spine's focus response alone has been lost twice (see 5), both times by an unrelated
 * refactor rather than by anyone repeating a mistake. See D016 and D020 in DECISIONS.md.
 *
 *   1. flip-direction      an interrupted card flight flew the wrong way, because
 *                          getBoundingClientRect() reports an in-progress transform and the
 *                          offset was subtracted where it should have been added.
 *   2. group-cohesion      reordering a group teleported its header 133px while its own cards
 *                          glided, because the FLIP effect only ever selected `.project`.
 *   3. confirm-arming      `Remove?` replaced `Remove` at identical coordinates, so a
 *                          double-click destroyed a bookmark with the confirmation never seen.
 *   4. menu-clamped        the action menu was placed at raw pointer coordinates and ran off
 *                          the viewport; then, once clamped, it grew back out of it when the
 *                          confirmation row appeared, stranding Cancel off screen.
 *   5. focus-instant       the focus ring eased its colour over 150ms on every arrow-key move,
 *                          and the spine stopped responding to focus entirely when it moved
 *                          from `width` to `transform`.
 *   6. scroll-not-movement a scroll between two renders looked like every element having moved,
 *                          because the FLIP effect compared viewport-relative rects across
 *                          renders - so the board jumped by the scroll distance on any render.
 *   7. reduced-motion      entrances must downgrade to opacity-only, and the two documented
 *                          exemptions must survive: `confirm-arm`, which is a safeguard rather
 *                          than an animation, and `landingpage-spin`, which is the only report
 *                          that work is still in flight.
 *   8. delete-dwell        a stationary pointer armed the delete zone visually, but its last
 *                          recorded drop effect still refused the release.
 *   9. delete-return       the drag left the webview and came back, and the delete zone stayed
 *                          dead for the rest of it - never highlighted, never armed.
 *  10. resize-baseline     a panel resize re-flowed the board without rendering, so the FLIP
 *                          baseline went stale and the next layout switch flew untouched groups.
 *  11. mru-twin           a bookmark that is also in `Recent` appears twice under one GUID, and
 *                          the two cards shared one FLIP baseline - so switching `Recent` between
 *                          layouts flew the group's copy across its neighbour and back.
 *  12. spine-hover        a painted bookmark must still grow its spine on hover. Guards a
 *                          specificity trap: `--spine-scale` has to be declared only on
 *                          `.project`, or a painted card's own rule wins and the hover is lost.
 *  13. scrim-stacking     the scrim dims by colour, never by opacity, because an animated
 *                          opacity creates a stacking context and takes the layering with it.
 *  14. fold-sync          the chevron and the group's height are one gesture expressed twice
 *                          and must settle together. Asserts a drift threshold, so it is the
 *                          most flake-prone check here - make it assert ordering when this
 *                          moves to Playwright (D020).
 *
 * Usage:
 *   npm run harness        # in another shell, or leave one running on 5599
 *   node scripts/motion-check.mjs
 *
 * It drives the real page through agent-browser, the same tool the notes in AGENTS.md describe,
 * and asserts on measured geometry and on posted messages - never on screenshots, which prove
 * appearance rather than behaviour.
 */
// @ts-check
import { execFileSync } from 'node:child_process';

/**
 * What one `evaluate()` can hand back. Every check parses JSON out of the page, so the shapes are
 * only ever these - and naming that is the difference between a check reading a field that does
 * not exist and failing honestly, versus comparing `undefined` against a number and passing.
 * @typedef {null|boolean|number|string|Measured|Array<Measured>} Evaluated
 * @typedef {Record<string, any>} Measured
 */

const URL_BASE = process.env.HARNESS_URL ?? 'http://localhost:5599/';
let failures = 0;
let checks = 0;
let skipped = 0;

/**
 * Run one agent-browser subcommand and return its trimmed stdout.
 * @param {...string} args
 * @returns {string}
 */
function browser(...args) {
  return execFileSync('agent-browser', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

/**
 * Evaluate in the page and parse the result.
 *
 * Everything is wrapped in an IIFE on purpose: each eval shares one document, so a bare `const`
 * from an earlier call collides with the next one and the whole check fails with a SyntaxError
 * that looks nothing like the thing being tested.
 *
 * @param {string} expression Body of a function evaluated in the page; must `return` a JSON string.
 * @returns {any} The parsed value. Typed loosely on purpose - the shape is whatever the caller's
 *   own `JSON.stringify` produced - but each caller annotates what it expects.
 */
function evaluate(expression) {
  const raw = browser('eval', `(()=>{${expression}})()`);
  const line = raw.split('\n').filter(Boolean).pop() ?? '';
  try { return JSON.parse(JSON.parse(line)); } catch { try { return JSON.parse(line); } catch { return line; } }
}

function open(query = '') {
  browser('open', URL_BASE + query);
  // The board is what every check measures, so wait for a card rather than for a duration - and
  // for its entrance to be over, since a rect or a computed value read mid-animation is not the
  // settled one. Waiting only for the element to exist is what made spine-hover read a spine
  // 4.9px wide and scrim-stacking read a palette at 0.82 opacity.
  waitUntil(`document.querySelector('.project') && document.getAnimations().length===0`,
    {label: 'the board to render and settle'});
}

/**
 * Block until an expression is truthy in the page, or the timeout expires.
 *
 * This is the reason almost nothing here sleeps a fixed duration any more. The waits are
 * synchronous on purpose - see {@link sleep} - but synchronous does not have to mean
 * clock-based, and a fixed sleep encodes an assumption about how fast the machine is that is
 * wrong the moment the machine is busy. Polling a condition is just as synchronous and states
 * what is actually being waited for.
 *
 * @param {string} expression JS evaluated in the page; truthy ends the wait.
 * @param {{timeout?:number, label?:string}} [options] `label` is what appears if it times out.
 * @returns {boolean} True if the condition was met, false on timeout.
 */
function waitUntil(expression, {timeout = 5000, label = expression} = {}) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (evaluate(`return JSON.stringify(!!(${expression}));`) === true) { return true; }
    if (Date.now() >= deadline) {
      console.log(`      (timed out after ${timeout}ms waiting for ${label})`);
      return false;
    }
    sleep(50);
  }
}

/**
 * Block the process for `ms`.
 *
 * Deliberately synchronous: these waits are for the page to settle, and interleaving them with
 * async control flow makes an ordering bug in the *check* look like a failure in the page.
 *
 * Prefer {@link waitUntil}. A bare sleep is correct only when waiting for something to *not*
 * happen - the absence of an event cannot be polled for, so proving no flight was started needs
 * a real elapsed wait. Those few call sites say so.
 *
 * @param {number} ms
 */
function sleep(ms) { execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]); }

/**
 * Record one assertion.
 * @param {string} name
 * @param {boolean} ok
 * @param {string} [detail]
 */
function check(name, ok, detail) {
  checks++;
  if (!ok) { failures++; }
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

/**
 * Record an assertion that could not be made, because the environment cannot support it.
 *
 * Distinct from a pass and from a failure on purpose: a check that silently passed when it could
 * not run would be the worst of the three, and this repo has already shipped a CSS rule that
 * tested green while matching no element at all.
 *
 * @param {string} name
 * @param {string} [reason]
 */
function skip(name, reason) {
  skipped++;
  console.log(`SKIP  ${name}${reason ? `  ${reason}` : ''}`);
}

/**
 * @param {...string} args
 */
function setMedia(...args) { browser('set', 'media', ...args); }

// 1 + 2. One layout switch interrupted by another, which is what typing in the filter does to
// the board many times a second. Cards must fly from where they visually were, and a group must
// carry its own cards rather than leaving them behind.
function flipChecks() {
  open();
  evaluate(`
    window.__log=[];
    const real=Element.prototype.animate;
    Element.prototype.animate=function(frames,opts){
      if(this.classList&&this.classList.contains('project')&&frames&&frames[0]&&frames[0].transform){
        window.__log.push({guid:this.dataset.guid, from:frames[0].transform, at:performance.now()});
      }
      return real.apply(this,arguments);
    };
    const btn=()=>[...document.querySelectorAll('.group button')].find(b=>/click to change layout/.test(b.title||''));
    btn().click();
    setTimeout(()=>{
      window.__mid={};
      document.querySelectorAll('.project').forEach(c=>{const r=c.getBoundingClientRect(); window.__mid[c.dataset.guid]={y:r.top};});
      btn().click();
    },80);
    setTimeout(()=>{
      window.__final={};
      document.querySelectorAll('.project').forEach(c=>{const r=c.getBoundingClientRect(); window.__final[c.dataset.guid]={y:r.top};});
    },1400);
    return JSON.stringify('started');
  `);
  waitUntil('window.__final', {label: 'both layout switches to settle'});
  const rows = evaluate(`
    const first=window.__log[0]?window.__log[0].at:0;
    const second=window.__log.filter(e=>e.at>first+50);
    return JSON.stringify(second.map(e=>{
      const m=/translate\\((-?[\\d.]+)px, *(-?[\\d.]+)px\\)/.exec(e.from)||[];
      const used=parseFloat(m[2]);
      const mid=window.__mid[e.guid], fin=window.__final[e.guid];
      const want = mid&&fin ? +(mid.y-fin.y).toFixed(1) : null;
      return {guid:e.guid, used:+used.toFixed(1), want, err: want===null?null:+(used-want).toFixed(1)};
    }));
  `);
  // Only cards that actually travelled. A card that barely moved is being carried by its group's
  // height animation rather than flying itself, so its measured layout position is legitimately
  // not its settled one and the direction expectation does not hold for it.
  const sameGroup = Array.isArray(rows) ? rows.filter(r => r.err !== null && Math.abs(r.want) > 1) : [];
  const wrongWay = sameGroup.filter(r => Math.sign(r.used) !== Math.sign(r.want));
  check('flip-direction  interrupted flights keep their direction',
    sameGroup.length > 0 && wrongWay.length === 0,
    `${sameGroup.length} measured, ${wrongWay.length} inverted`);
}

// 2. The group and its cards must move as one body: the distance between a group's header and
// its first card is fixed by layout, so it must not vary on any frame of a reorder.
function groupCohesion() {
  open();
  evaluate(`
    const g0=document.querySelectorAll('.group')[0];
    window.__ids={group:g0.dataset.guid, card:g0.querySelector('.project').dataset.guid};
    const dt=new DataTransfer();
    g0.querySelector('.titlebar').dispatchEvent(new DragEvent('dragstart',{bubbles:true,dataTransfer:dt}));
    return JSON.stringify('drag');
  `);
  waitUntil(`document.querySelector('.group.dragging')`, {label: 'the group to enter its carried state'});
  evaluate(`
    const g1=document.querySelectorAll('.group')[1]; const r=g1.getBoundingClientRect(); const dt=new DataTransfer();
    g1.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.left+20,clientY:r.bottom-4}));
    return JSON.stringify('over');
  `);
  waitUntil(`document.querySelector('.group[data-drop]')`, {label: 'the drop indicator to appear'});
  evaluate(`
    window.__tr=[]; const t0=performance.now();
    const tick=()=>{
      const g=document.querySelector('.group[data-guid="'+window.__ids.group+'"]');
      const c=document.querySelector('.project[data-guid="'+window.__ids.card+'"]');
      if(g&&c){window.__tr.push(+(c.getBoundingClientRect().top-g.querySelector('.titlebar').getBoundingClientRect().top).toFixed(1));}
      if(performance.now()-t0<700) requestAnimationFrame(tick); else window.__trDone=true;
    };
    const g1=document.querySelectorAll('.group')[1]; const dt=new DataTransfer();
    g1.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
    requestAnimationFrame(tick);
    return JSON.stringify('dropped');
  `);
  waitUntil('window.__trDone', {label: 'the reorder recorder to finish'});
  const gaps = evaluate('return JSON.stringify(window.__tr||[]);');
  const spread = Array.isArray(gaps) && gaps.length ? Math.max(...gaps) - Math.min(...gaps) : -1;
  check('group-cohesion  header and card move as one body',
    spread >= 0 && spread <= 1, `gap varied by ${spread}px across ${gaps.length} frames`);
}

// 3. The confirmation must not be pressable by the second half of a double-click, and must be
// pressable by a deliberate one.
function confirmArming({reduced = false} = {}) {
  open();
  evaluate(`
    const c=document.querySelector('.project'), r=c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+40,clientY:r.top+10}));
    return JSON.stringify('menu');
  `);
  waitUntil(`document.querySelector('.ctxmenu')`, {label: 'the action menu to open'});
  const result = evaluate(`
    window.__r={};
    const rm=[...document.querySelectorAll('.ctxmenu button')].find(x=>/^Remove$/.test(x.textContent.trim()));
    const b=rm.getBoundingClientRect(); const cx=b.x+b.width/2, cy=b.y+b.height/2;
    window.__r.before=(window.__posted||[]).length;
    rm.click();
    setTimeout(()=>{
      const el=document.elementFromPoint(cx,cy); const btn=el&&el.closest?el.closest('button'):null;
      if(btn) btn.click();
      window.__r.afterFast=(window.__posted||[]).length;
    },90);
    setTimeout(()=>{
      const el=document.elementFromPoint(cx,cy); const btn=el&&el.closest?el.closest('button'):null;
      if(btn) btn.click();
      window.__r.afterSlow=(window.__posted||[]).length;
    },450);
    return JSON.stringify('armed');
  `);
  void result;
  waitUntil('window.__r && window.__r.afterSlow!==undefined', {label: 'both confirmation clicks to land'});
  const r = evaluate('return JSON.stringify(window.__r||{});');
  const label = reduced ? 'confirm-arming (reduced motion)' : 'confirm-arming';
  check(`${label}  a 90ms second click is refused`,
    r.afterFast === r.before, `posted ${r.afterFast - r.before}`);
  check(`${label}  a 450ms deliberate click is accepted`,
    r.afterSlow === r.before + 1, `posted ${r.afterSlow - r.before}`);
}

// 4. Opened at the pointer, the menu must land on screen - and must stay on screen when its own
// content grows underneath it.
function menuClamping() {
  browser('set', 'viewport', '1280', '500');
  open();
  evaluate(`
    const c=document.querySelector('.project');
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:innerWidth-30,clientY:innerHeight-20}));
    return JSON.stringify('corner');
  `);
  waitUntil(`document.querySelector('.ctxmenu')`, {label: 'the action menu to open'});
  const onOpen = evaluate(`
    const b=document.querySelector('.ctxmenu').getBoundingClientRect();
    return JSON.stringify({fits: b.right<=innerWidth && b.bottom<=innerHeight && b.left>=0 && b.top>=0});
  `);
  check('menu-clamped  opens inside the viewport at a corner', onOpen.fits === true);

  evaluate(`
    const rm=[...document.querySelectorAll('.ctxmenu button')].find(x=>/^Remove$/.test(x.textContent.trim()));
    if(rm) rm.click();
    return JSON.stringify('grow');
  `);
  waitUntil(`[...document.querySelectorAll('.ctxmenu button')].some(b=>/Cancel/.test(b.textContent))`,
    {label: 'the confirmation row to grow the menu'});
  const onGrow = evaluate(`
    const m=document.querySelector('.ctxmenu'); const b=m.getBoundingClientRect();
    const cancel=[...m.querySelectorAll('button')].find(x=>/Cancel/.test(x.textContent));
    return JSON.stringify({fits:b.bottom<=innerHeight, cancelVisible: cancel? cancel.getBoundingClientRect().bottom<=innerHeight : false});
  `);
  check('menu-clamped  stays inside it when the confirmation row grows',
    onGrow.fits === true && onGrow.cancelVisible === true,
    `fits=${onGrow.fits} cancelVisible=${onGrow.cancelVisible}`);
  browser('set', 'viewport', '1280', '800');
}

// 5. Keyboard navigation is the most repeated action here, so the ring must not ease, and the
// spine must respond to focus and not only to hover.
function focusChecks() {
  open();
  const r = evaluate(`
    const c=document.querySelector('.project'); c.focus();
    const cs=getComputedStyle(c);
    const durations=cs.transitionDuration.split(',').map(s=>s.trim());
    const props=cs.transitionProperty.split(',').map(s=>s.trim());
    const outline=props.indexOf('outline-color');
    return JSON.stringify({
      // Both assertions below read a value that only exists while \`:focus\` matches, and it does
      // not match at all in a window the OS considers unfocused - so the environment has to be
      // reported alongside the measurement or a green run proves nothing and a red one is a lie.
      // This exact trap already cost this repo a CSS rewrite: \`:focus-visible\` was declared
      // unreliable and replaced on the strength of a measurement taken while hasFocus was false.
      hasFocus: document.hasFocus(),
      matchesFocus: c.matches(':focus'),
      spine: cs.getPropertyValue('--spine-scale').trim(),
      outlineDuration: outline>=0 ? durations[outline] : 'absent',
      spineWidth: +c.querySelector('.spine').getBoundingClientRect().width.toFixed(1)
    });
  `);
  // Not a check: a skip. Failing here would report a broken focus ring, which is not what an
  // unfocused window is evidence of.
  if (!r.hasFocus || !r.matchesFocus) {
    skip('focus-instant  focus ring does not ease its colour',
      `window unfocused (hasFocus=${r.hasFocus}, :focus matched=${r.matchesFocus})`);
    skip('focus-instant  focused spine reaches full width', 'same');
    return;
  }
  check('focus-instant  focus ring does not ease its colour', r.outlineDuration === '0s', `got ${r.outlineDuration}`);
  // 4px is the spine's full box - see `.spine` in landingpage.scss. What is being asserted is
  // that focus reaches it, not the number itself.
  check('focus-instant  focused spine reaches full width', r.spine === '1' && r.spineWidth === 4,
    `scale=${r.spine} width=${r.spineWidth}`);
}

// 7. The spine responds to the pointer on a *painted* bookmark.
//
// This is a specificity trap, not a value. `--spine-scale` has to be declared only on `.project`
// and `.project:hover`; putting the painted variant's resting size on the same property would
// place it on `.project[data-shade]:not([data-shade=""])`, which outranks `:hover`, and painted
// bookmarks - the overwhelming majority of a real board - would become the only ones that
// ignored the pointer. Hover is asserted through the real pointer, since `:hover` cannot be
// faked from script.
function spineHover() {
  open();
  const painted = evaluate(`
    const c=document.querySelector('.project[data-shade]:not([data-shade=""])');
    return JSON.stringify({guid:c?c.dataset.guid:null, rest:c?getComputedStyle(c).getPropertyValue('--spine-scale').trim():null});
  `);
  browser('hover', `.project[data-guid="${painted.guid}"]`);
  waitUntil(`document.querySelector('.project[data-guid="${painted.guid}"]:hover')
    && document.getAnimations().length===0`,
    {label: 'the spine to finish growing under the pointer'});
  const hovered = evaluate(`
    const c=document.querySelector('.project[data-guid="${painted.guid}"]');
    return JSON.stringify({scale:getComputedStyle(c).getPropertyValue('--spine-scale').trim(),
      width:+c.querySelector('.spine').getBoundingClientRect().width.toFixed(1)});
  `);
  check('spine-hover  a painted bookmark still grows its spine on hover',
    painted.rest !== '1' && hovered.scale === '1' && hovered.width === 4,
    `rest=${painted.rest} hover=${hovered.scale} width=${hovered.width}`);
}

// 8. The scrim dims the board without dimming the thing it is behind.
//
// The page's most-repeated trap: alpha belongs in the colour, never in `opacity`, because
// `opacity` on a parent creates a stacking context its children cannot climb out of. That
// applies to the *animation* too - fading the scrim in via `opacity` would dim the palette for
// the length of the fade, and a child `opacity: 1` cannot undo it.
function scrimStacking() {
  open();
  evaluate(`
    const c=document.querySelector('.project'), r=c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+40,clientY:r.top+10}));
    return JSON.stringify('menu');
  `);
  waitUntil(`document.querySelector('.ctxmenu')`, {label: 'the action menu to open'});
  evaluate(`
    const b=[...document.querySelectorAll('.ctxmenu button')].find(x=>/Accent colour/.test(x.textContent));
    if(b) b.click();
    return JSON.stringify('palette');
  `);
  waitUntil(`document.querySelector('.palette') && document.getAnimations().length===0`,
    {label: 'the accent palette to open and settle'});
  const r = evaluate(`
    const m=document.querySelector('.modal'), p=document.querySelector('.palette');
    if(!m||!p) return JSON.stringify({missing:true});
    const mc=getComputedStyle(m);
    let frames=[]; const anim=m.getAnimations()[0];
    if(anim){try{frames=anim.effect.getKeyframes();}catch(e){}}
    return JSON.stringify({
      scrimOpacity: mc.opacity,
      paletteOpacity: getComputedStyle(p).opacity,
      // A keyframe touching opacity is the regression this guards against.
      keyframesTouchOpacity: frames.some(f=>f.opacity!==undefined)
    });
  `);
  check('scrim-stacking  the scrim dims by colour, never by opacity',
    r.missing !== true && r.scrimOpacity === '1' && r.paletteOpacity === '1' && r.keyframesTouchOpacity === false,
    `scrim=${r.scrimOpacity} palette=${r.paletteOpacity} opacityKeyframes=${r.keyframesTouchOpacity}`);
}

/** Starts a real pointer drag from the first bookmark into the delete zone. */
function dragFirstBookmarkToDeleteZone() {
  const point = evaluate(`
    const card=document.querySelector('.project');
    const rect=card.getBoundingClientRect();
    return JSON.stringify({x:Math.round(rect.left+rect.width/2), y:Math.round(rect.top+rect.height/2)});
  `);
  browser('mouse', 'move', String(point.x), String(point.y));
  browser('mouse', 'down');
  browser('mouse', 'move', String(point.x+12), String(point.y+12));
  waitUntil(`document.querySelector('.dropbin')`, {label: 'the delete zone to appear'});
  const target = evaluate(`
    const zone=document.querySelector('.dropbin');
    const rect=zone.getBoundingClientRect();
    return JSON.stringify({x:Math.round(rect.left+rect.width/2), y:Math.round(rect.top+rect.height/2)});
  `);
  browser('mouse', 'move', String(target.x), String(target.y));
  waitUntil(`document.querySelector('.dropbin[data-over]')`, {label: 'the delete zone to receive the drag'});
}

// 8. The dwell is a real safeguard, and an armed zone must also remain a valid browser drop
// target when the pointer stays still. The bug was a split verdict: the timer changed the label
// to "Release to remove", while the last dragover had already recorded `dropEffect: none`.
// Chromium then cancelled the release without dispatching `drop` at all.
function deleteDwell() {
  open();
  dragFirstBookmarkToDeleteZone();
  sleep(90);
  browser('mouse', 'up');
  sleep(100);
  const early = evaluate(`return JSON.stringify((window.__posted||[]).filter(m=>m.command==='remove').length);`);
  check('delete-dwell  an early release is refused', early === 0, `posted ${early}`);

  open();
  dragFirstBookmarkToDeleteZone();
  waitUntil(`document.querySelector('.dropbin[data-armed]')`, {label: 'the delete zone to arm'});
  // agent-browser's low-level mouse release omits dragend when no movement preceded it. Dispatch
  // the browser event at the measured release point to exercise the application's fallback.
  evaluate(`
    const zone=document.querySelector('.dropbin').getBoundingClientRect();
    document.querySelector('.project.dragging').dispatchEvent(new DragEvent('dragend',{bubbles:true,clientX:zone.left+zone.width/2,clientY:zone.top+zone.height/2}));
    return JSON.stringify('released');
  `);
  browser('mouse', 'up');
  waitUntil(`(window.__posted||[]).some(m=>m.command==='remove')`, {label: 'the armed release to post remove'});
  const armed = evaluate(`return JSON.stringify((window.__posted||[]).filter(m=>m.command==='remove').length);`);
  check('delete-dwell  an armed stationary release removes', armed === 1, `posted ${armed}`);
}

// 13. The delete zone wakes up again after the drag has been outside the webview.
//
// Carrying a bookmark off the page - over the terminal panel, or off the window - fires
// `dragleave` on the zone and resets it, but Chromium keeps the zone as its current drop
// target. Coming back over it resumes `dragover` with no `dragenter`, so a zone that woke only
// on `dragenter` stayed dead for the rest of the drag: it never highlighted and never armed,
// and the only way out was to drop and start again.
//
// The leave and the return are dispatched rather than mimed with the mouse, because that
// asymmetry is the whole bug: a synthetic pointer move back into the zone would carry the
// `dragenter` the real re-entry omits, and the check would pass against the broken code.
function deleteZoneAfterLeavingWindow() {
  open();
  dragFirstBookmarkToDeleteZone();
  evaluate(`
    const zone=document.querySelector('.dropbin');
    zone.dispatchEvent(new DragEvent('dragleave',{bubbles:true,relatedTarget:null}));
    return JSON.stringify('left');
  `);
  waitUntil(`!document.querySelector('.dropbin[data-over]')`, {label: 'the zone to reset on leaving'});
  evaluate(`
    const zone=document.querySelector('.dropbin');
    const rect=zone.getBoundingClientRect();
    window.__back=setInterval(()=>zone.dispatchEvent(new DragEvent('dragover',
      {bubbles:true,cancelable:true,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2})),30);
    return JSON.stringify('returned');
  `);
  const lit = waitUntil(`document.querySelector('.dropbin[data-over]')`, {label: 'the zone to highlight again'});
  check('delete-return    the zone highlights again after the drag left the webview', lit,
    lit ? 'lit by dragover alone' : 'never highlighted');
  const arms = waitUntil(`document.querySelector('.dropbin[data-armed]')`, {label: 'the zone to arm again'});
  check('delete-return    and still arms by dwell', arms, arms ? 'armed' : 'never armed');
  evaluate(`clearInterval(window.__back); return JSON.stringify('stopped');`);
  browser('mouse', 'up');
}

// 9. The two halves of a fold finish together.
//
// The chevron rotation and the group's height are one gesture expressed twice, and they are
// timed from the same token for that reason. When they drifted apart the arrow settled early and
// sat there while the group was still closing.
// A scroll is not a movement. `getBoundingClientRect()` is viewport-relative and the FLIP
// effect compares its results across renders, so scrolling between two renders looked exactly
// like every element on the board having moved. Scroll 150px, then re-render by any means at
// all - right-click a card, hover one, type a character in the filter - and the whole board
// flew 150px and settled. This is the reported "the page randomly jumps a little bit", and it
// needed no layout change to happen, only a scroll and a render.
//
// Both halves matter: a scroll must produce no flights, and a real layout change must still
// produce them, or the fix could be "never animate anything" and pass.
function scrollIsNotMovement() {
  open();
  evaluate(`
    const spacer=document.createElement('div');
    spacer.style.cssText='height:1200px';
    document.body.appendChild(spacer);
    window.__f=[];
    const real=Element.prototype.animate;
    Element.prototype.animate=function(frames,opts){
      if(this.classList&&(this.classList.contains('project')||this.classList.contains('group'))){
        window.__f.push(1);
      }
      return real.apply(this,arguments);
    };
    return JSON.stringify('armed');
  `);
  // The board's own entrance animations must be finished before the hook can attribute anything
  // to the scroll, so wait for the page to be still rather than for a duration.
  waitUntil('document.getAnimations().length===0', {label: 'the board entrance to finish'});
  const result = evaluate(`
    const el=document.scrollingElement;
    el.scrollTop=150;
    return JSON.stringify({scrollable: el.scrollHeight>el.clientHeight, top: el.scrollTop});
  `);
  waitUntil('document.getAnimations().length===0', {label: 'the scroll to settle'});
  const scrolled = evaluate(`
    window.__f=[];
    document.querySelector('.project').dispatchEvent(
      new MouseEvent('contextmenu',{bubbles:true,clientX:300,clientY:200}));
    return JSON.stringify('rendered');
  `);
  // One of the two sleeps that has to stay. The assertion is that *no* flight starts, and the
  // absence of an event cannot be polled for - a poll would return immediately and prove
  // nothing. Its partner below waits exactly as long for the opposite reason: the two halves
  // are only a fair comparison if they give the page the same amount of time to animate.
  sleep(200);
  const afterScroll = evaluate(`return JSON.stringify(window.__f.length);`);
  check('scroll-not-movement  a render while scrolled starts no flights',
    result.scrollable && afterScroll === 0,
    `scrolled ${result.top}px, ${afterScroll} flights`);

  const afterMove = evaluate(`
    window.__f=[];
    const btn=[...document.querySelectorAll('.group button')].find(b=>/click to change layout/.test(b.title||''));
    btn.click();
    return JSON.stringify('switched');
  `);
  // Deliberately the same fixed wait as its partner above, not a poll for `__f.length>0`.
  // Polling here would give the layout switch as long as it needed while the scroll got 200ms,
  // and "a scroll is not a movement" would then be comparing two different questions.
  sleep(200);
  const moves = evaluate(`return JSON.stringify(window.__f.length);`);
  check('scroll-not-movement  a real layout change still flies',
    moves > 0, `${moves} flights`);
  void scrolled; void afterMove;
}

// 11. A resize is not a movement either, and it is the same class of bug as check 6.
//
// The FLIP baseline is only written during a render. Dragging the editor panel narrower re-wraps
// every grid and re-flows every group without rendering anything, so the baseline goes on
// describing the wide layout. The next render for any reason at all - switching one group
// between list, grid and compact, say - then read that stale baseline as movement and flew
// groups nobody had touched: narrowing the panel and switching `Recent` slid an untouched
// group's card 34px sideways, a beat after the resize that actually moved it.
//
// Both halves again, for the same reason as check 6: the switched group's own cards must still
// fly, or "never animate anything" would pass.
function resizeIsNotMovement() {
  open();
  browser('set', 'viewport', '760', '800');
  waitUntil('document.getAnimations().length===0', {label: 'the resize to settle'});
  evaluate(`
    window.__f=[];
    const real=Element.prototype.animate;
    Element.prototype.animate=function(frames,opts){
      const owner=this.closest&&this.closest('.group');
      if(owner&&(this.classList.contains('project')||this.classList.contains('group'))){
        window.__f.push(owner.dataset.guid);
      }
      return real.apply(this,arguments);
    };
    const mru=document.querySelector('.group[data-guid="@vsc-mru"]');
    mru.querySelector('button[data-role="layout"]').click();
    return JSON.stringify('switched');
  `);
  // A fixed wait, like check 6's: half the assertion is that something did *not* animate, and
  // the absence of a flight cannot be polled for.
  sleep(300);
  /** @type {string[]} */
  const flew = evaluate(`return JSON.stringify(window.__f);`);
  const strangers = flew.filter(guid => guid !== '@vsc-mru');
  check('resize-baseline  a layout switch after a resize leaves other groups alone',
    strangers.length === 0, `${strangers.length} stray flights: ${strangers.join(',') || 'none'}`);
  check('resize-baseline  the switched group still flies',
    flew.some(guid => guid === '@vsc-mru'), `${flew.length} flights`);
  browser('set', 'viewport', '1280', '800');
}

// 12. Switching one group's layout moves that group's cards and nothing else.
//
// The board can hold the same bookmark twice: once in a group and once in `Recent`, under one
// GUID. The FLIP baseline was keyed on that GUID alone, so both cards wrote to the same entry -
// whichever was measured last won - and the next render read the other card's position as
// movement. Clicking `Recent`'s layout button flew a card in an untouched group sideways across
// its neighbour and slid it back, which is what the bug report showed.
//
// Both halves again, as in checks 6 and 11: the switched group's own cards must still fly, or
// "nothing animates" would pass.
function mruTwinBaseline() {
  open();
  evaluate(`
    window.__f=[];
    const real=Element.prototype.animate;
    Element.prototype.animate=function(frames,opts){
      const owner=this.closest&&this.closest('.group');
      if(owner&&(this.classList.contains('project')||this.classList.contains('group'))){
        window.__f.push(owner.dataset.guid);
      }
      return real.apply(this,arguments);
    };
    document.querySelector('.group[data-guid="@vsc-mru"] button[data-role="layout"]').click();
    return JSON.stringify('switched');
  `);
  // Fixed, like checks 6 and 11: half the assertion is that something did *not* animate.
  sleep(300);
  /** @type {string[]} */
  const flew = evaluate(`return JSON.stringify(window.__f);`);
  const strangers = flew.filter(guid => guid !== '@vsc-mru');
  check('mru-twin         a layout switch leaves the twin in another group alone',
    strangers.length === 0, `${strangers.length} stray flights: ${strangers.join(',') || 'none'}`);
  check('mru-twin         the switched group still flies',
    flew.some(guid => guid === '@vsc-mru'), `${flew.length} flights`);
}

function foldSync() {
  open();
  evaluate(`
    const g=document.querySelector('.group');
    const chev=g.querySelector('.titlebar [aria-expanded] .icon');
    const box=g.querySelector('.foldable');
    window.__f=[]; const t0=performance.now();
    const tick=()=>{
      const m=new DOMMatrixReadOnly(getComputedStyle(chev).transform);
      window.__f.push([+(performance.now()-t0).toFixed(0),
        +(Math.atan2(m.b,m.a)*180/Math.PI).toFixed(1),
        +box.getBoundingClientRect().height.toFixed(1)]);
      if(performance.now()-t0<700) requestAnimationFrame(tick); else window.__fDone=true;
    };
    g.querySelector('.titlebar [aria-expanded]').click();
    requestAnimationFrame(tick);
    return JSON.stringify('folding');
  `);
  waitUntil('window.__fDone', {label: 'the fold recorder to finish'});
  const settled = evaluate(`
    const f=window.__f||[];
    const at=(idx)=>{for(let i=f.length-1;i>0;i--){if(Math.abs(f[i][idx]-f[i-1][idx])>0.5) return f[i][0];} return 0;};
    return JSON.stringify({chevron:at(1), height:at(2), frames:f.length});
  `);
  const drift = Math.abs(settled.chevron - settled.height);
  check('fold-sync  chevron and group height settle together',
    settled.frames > 5 && settled.chevron > 0 && drift <= 40,
    `chevron ${settled.chevron}ms, height ${settled.height}ms, drift ${drift}ms`);
}

// 6. Reduced motion downgrades entrances to opacity rather than switching them off, and no
// *entrance* may carry a transform.
//
// "No animation anywhere may carry a transform" is the rule this used to state, and it was
// wrong in a way that stayed hidden: `landingpage-spin` is exempt by design - the stylesheet
// says so where the exemption is written - because a busy spinner is the only thing telling
// the user a round trip is still in flight, and it has no static equivalent. It is a rotation,
// so it does carry a transform. The old blanket assertion passed only because a resting page
// has no spinner running, which meant the check agreed with the stylesheet by luck. The first
// person to sweep a busy page would have been told the spinner was a regression.
//
// So the rule is now stated with its exemption, and the exemption is *tested* rather than
// merely tolerated: the spinner is armed on purpose below and asserted to still be moving.
function reducedMotion() {
  // `finally`, because the media override lives in the browser session and that session outlives
  // this process. Without it, anything throwing between here and the restore leaves reduced
  // motion forced on for every subsequent run - and a poisoned run does not look poisoned, it
  // looks like four genuine motion regressions (flip-direction, focus-instant,
  // scroll-not-movement and fold-sync all fail, because under reduced motion there is nothing
  // moving for them to measure). Confirmed by forcing it: 12/16 with four plausible-looking
  // failures, green again the moment the media state was restored.
  try {
    reducedMotionChecks();
  } finally {
    setMedia('dark');
  }
}

function reducedMotionChecks() {
  setMedia('dark', 'reduced-motion');
  open();
  evaluate(`
    window.__seen=[]; window.__swept=0;
    window.__sweep=()=>{
      for (const a of document.getAnimations()) {
        let frames=[]; try{frames=a.effect.getKeyframes();}catch(e){}
        window.__seen.push({
          name:a.animationName||'(waapi)',
          transform:frames.some(f=>f.transform!==undefined||f.scale!==undefined||f.translate!==undefined)
        });
      }
      window.__swept++;
    };
    const c=document.querySelector('.project'), r=c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+40,clientY:r.top+10}));
    setTimeout(window.__sweep,30);
    return JSON.stringify('menu');
  `);
  waitUntil('window.__swept>=1', {label: 'the menu animation sweep'});
  evaluate(`
    const p=[...document.querySelectorAll('.ctxmenu button')].find(x=>/Accent colour/.test(x.textContent));
    if(p) p.click();
    setTimeout(window.__sweep,30);
    return JSON.stringify('palette');
  `);
  waitUntil('window.__swept>=2', {label: 'the palette animation sweep'});

  // The busy spinner, armed deliberately. It is the one animation the stylesheet keeps running
  // under reduced motion, so it has to be on the page for the exemption below to mean anything
  // - and `data-busy` is what the refresh control sets while it waits for the host.
  evaluate(`
    const b=document.querySelector('[data-role="refresh"]');
    if(b) b.setAttribute('data-busy','yes');
    setTimeout(window.__sweep,30);
    return JSON.stringify('spinner');
  `);
  waitUntil('window.__swept>=3', {label: 'the spinner animation sweep'});

  const seen = evaluate('return JSON.stringify(window.__seen||[]);');
  const all = Array.isArray(seen) ? seen : [];
  // Exempt by name, not by "anything still moving is probably fine". A new transform-carrying
  // animation must fail this check; only the one the stylesheet documents may pass it.
  const EXEMPT = ['landingpage-spin'];
  const moving = Array.isArray(seen) ? seen.filter(s => s.transform && !EXEMPT.includes(s.name)) : [{name: 'unreadable'}];
  check('reduced-motion  no entrance carries a transform',
    Array.isArray(seen) && all.length > 0 && moving.length === 0,
    `${all.length} animations, ${moving.length} moving${moving.length ? `: ${moving.map(m => m.name).join(', ')}` : ''}`);

  // The other half of the same rule, and the half that has no other guard: reduced motion must
  // not switch the spinner off. Nothing else on the page reports that work is still running.
  const spinner = all.filter(s => s.name === 'landingpage-spin');
  check('reduced-motion  the busy spinner keeps turning',
    spinner.length > 0 && spinner.every(s => s.transform),
    spinner.length ? `${spinner.length} running, rotating` : 'no landingpage-spin animation found');

  // The safeguard is not an animation and must not be downgraded with the rest.
  confirmArming({reduced: true});
}

try {
  browser('open', URL_BASE);
} catch {
  console.error(`cannot reach ${URL_BASE} - start the harness first:  npm run harness`);
  process.exit(2);
}

// Every piece of browser state this script changes is restored here as well as at the call site,
// because the browser session outlives the process and a leaked override silently corrupts the
// *next* run rather than this one. `media` is the one that has actually bitten; `viewport` is
// changed by menuClamping and restored the same way.
function restoreBrowserState() {
  try { setMedia('dark'); } catch { /* browser already gone: nothing to restore */ }
  try { browser('set', 'viewport', '1280', '800'); } catch { /* ditto */ }
}

let crashed = null;
try {
  flipChecks();
  groupCohesion();
  confirmArming();
  menuClamping();
  focusChecks();
  spineHover();
  scrimStacking();
  deleteDwell();
  deleteZoneAfterLeavingWindow();
  scrollIsNotMovement();
  resizeIsNotMovement();
  mruTwinBaseline();
  foldSync();
  reducedMotion();
} catch (err) {
  crashed = err;
} finally {
  restoreBrowserState();
}

if (crashed) {
  console.error(`\ncheck run aborted: ${crashed && crashed.message ? crashed.message : crashed}`);
  process.exit(3);
}

console.log(`\n${checks - failures}/${checks} checks passed${skipped ? `, ${skipped} skipped` : ''}`);
// A skip is not a pass. It does not fail the run - an unfocused window is an environment fact,
// not a regression - but it must never be counted as evidence that the check succeeded.
process.exit(failures ? 1 : 0);
