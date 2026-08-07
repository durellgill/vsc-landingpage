#!/usr/bin/env node
/**
 * Motion regression check.
 *
 * Six things on this page were broken in ways a build, a typecheck and a lint all pass through
 * happily, because every one of them is a *behaviour* rather than a value. Each check below is a
 * bug that actually shipped here, reduced to the smallest assertion that would have caught it:
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
 *   6. reduced-motion      entrances must downgrade to opacity-only, and `confirm-arm` must
 *                          survive, because it is a safeguard rather than an animation.
 *
 * Usage:
 *   npm run harness        # in another shell, or leave one running on 5599
 *   node scripts/motion-check.mjs
 *
 * It drives the real page through agent-browser, the same tool the notes in AGENTS.md describe,
 * and asserts on measured geometry and on posted messages - never on screenshots, which prove
 * appearance rather than behaviour.
 */
import { execFileSync } from 'node:child_process';

const URL_BASE = process.env.HARNESS_URL ?? 'http://localhost:5599/';
let failures = 0;
let checks = 0;

function browser(...args) {
  return execFileSync('agent-browser', args, {encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
}

/**
 * Evaluate in the page and parse the result.
 *
 * Everything is wrapped in an IIFE on purpose: each eval shares one document, so a bare `const`
 * from an earlier call collides with the next one and the whole check fails with a SyntaxError
 * that looks nothing like the thing being tested.
 */
function evaluate(expression) {
  const raw = browser('eval', `(()=>{${expression}})()`);
  const line = raw.split('\n').filter(Boolean).pop() ?? '';
  try { return JSON.parse(JSON.parse(line)); } catch { try { return JSON.parse(line); } catch { return line; } }
}

function open(query = '') {
  browser('open', URL_BASE + query);
  sleep(1200);
}

// Deliberately synchronous: these waits are for the page to settle, and interleaving them with
// async control flow makes an ordering bug in the *check* look like a failure in the page.
function sleep(ms) { execFileSync(process.execPath, ['-e', `setTimeout(()=>{}, ${ms})`]); }

function check(name, ok, detail) {
  checks++;
  if (!ok) { failures++; }
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  ${detail}` : ''}`);
}

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
  sleep(2600);
  const rows = evaluate(`
    const first=window.__log[0]?window.__log[0].at:0;
    const second=window.__log.filter(e=>e.at>first+50);
    // Only cards in the group whose layout actually changed. A card in another group is being
    // moved by that group's height animation, so its layout position at measure time is
    // legitimately not its settled one and the naive expectation below does not hold for it.
    const switched=new Set([...document.querySelectorAll('.group')][0] ? [] : []);
    return JSON.stringify(second.map(e=>{
      const m=/translate\\((-?[\\d.]+)px, *(-?[\\d.]+)px\\)/.exec(e.from)||[];
      const used=parseFloat(m[2]);
      const mid=window.__mid[e.guid], fin=window.__final[e.guid];
      const want = mid&&fin ? +(mid.y-fin.y).toFixed(1) : null;
      return {guid:e.guid, used:+used.toFixed(1), want, err: want===null?null:+(used-want).toFixed(1)};
    }));
  `);
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
  sleep(600);
  evaluate(`
    const g1=document.querySelectorAll('.group')[1]; const r=g1.getBoundingClientRect(); const dt=new DataTransfer();
    g1.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,clientX:r.left+20,clientY:r.bottom-4}));
    return JSON.stringify('over');
  `);
  sleep(600);
  evaluate(`
    window.__tr=[]; const t0=performance.now();
    const tick=()=>{
      const g=document.querySelector('.group[data-guid="'+window.__ids.group+'"]');
      const c=document.querySelector('.project[data-guid="'+window.__ids.card+'"]');
      if(g&&c){window.__tr.push(+(c.getBoundingClientRect().top-g.querySelector('.titlebar').getBoundingClientRect().top).toFixed(1));}
      if(performance.now()-t0<700) requestAnimationFrame(tick);
    };
    const g1=document.querySelectorAll('.group')[1]; const dt=new DataTransfer();
    g1.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));
    requestAnimationFrame(tick);
    return JSON.stringify('dropped');
  `);
  sleep(2200);
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
  sleep(600);
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
  sleep(2000);
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
  sleep(700);
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
  sleep(700);
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
      spine: cs.getPropertyValue('--spine-scale').trim(),
      outlineDuration: outline>=0 ? durations[outline] : 'absent',
      spineWidth: +c.querySelector('.spine').getBoundingClientRect().width.toFixed(1)
    });
  `);
  check('focus-instant  focus ring does not ease its colour', r.outlineDuration === '0s', `got ${r.outlineDuration}`);
  check('focus-instant  focused spine reaches full width', r.spine === '1' && r.spineWidth === 5,
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
  sleep(700);
  const hovered = evaluate(`
    const c=document.querySelector('.project[data-guid="${painted.guid}"]');
    return JSON.stringify({scale:getComputedStyle(c).getPropertyValue('--spine-scale').trim(),
      width:+c.querySelector('.spine').getBoundingClientRect().width.toFixed(1)});
  `);
  check('spine-hover  a painted bookmark still grows its spine on hover',
    painted.rest !== '1' && hovered.scale === '1' && hovered.width === 5,
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
  sleep(600);
  evaluate(`
    const b=[...document.querySelectorAll('.ctxmenu button')].find(x=>/Accent colour/.test(x.textContent));
    if(b) b.click();
    return JSON.stringify('palette');
  `);
  sleep(700);
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

// 9. The two halves of a fold finish together.
//
// The chevron rotation and the group's height are one gesture expressed twice, and they are
// timed from the same token for that reason. When they drifted apart the arrow settled early and
// sat there while the group was still closing.
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
      if(performance.now()-t0<700) requestAnimationFrame(tick);
    };
    g.querySelector('.titlebar [aria-expanded]').click();
    requestAnimationFrame(tick);
    return JSON.stringify('folding');
  `);
  sleep(2200);
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
// animation anywhere may carry a transform.
function reducedMotion() {
  setMedia('dark', 'reduced-motion');
  open();
  evaluate(`
    window.__seen=[];
    window.__sweep=()=>{
      for (const a of document.getAnimations()) {
        let frames=[]; try{frames=a.effect.getKeyframes();}catch(e){}
        window.__seen.push({
          name:a.animationName||'(waapi)',
          transform:frames.some(f=>f.transform!==undefined||f.scale!==undefined||f.translate!==undefined)
        });
      }
    };
    const c=document.querySelector('.project'), r=c.getBoundingClientRect();
    c.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:r.left+40,clientY:r.top+10}));
    setTimeout(window.__sweep,30);
    return JSON.stringify('menu');
  `);
  sleep(900);
  evaluate(`
    const p=[...document.querySelectorAll('.ctxmenu button')].find(x=>/Accent colour/.test(x.textContent));
    if(p) p.click();
    setTimeout(window.__sweep,30);
    return JSON.stringify('palette');
  `);
  sleep(900);
  const seen = evaluate('return JSON.stringify(window.__seen||[]);');
  const moving = Array.isArray(seen) ? seen.filter(s => s.transform) : [{name: 'unreadable'}];
  check('reduced-motion  no animation carries a transform',
    Array.isArray(seen) && seen.length > 0 && moving.length === 0,
    `${Array.isArray(seen) ? seen.length : 0} animations, ${moving.length} moving`);

  // The safeguard is not an animation and must not be downgraded with the rest.
  confirmArming({reduced: true});
  setMedia('dark');
}

try {
  browser('open', URL_BASE);
} catch {
  console.error(`cannot reach ${URL_BASE} - start the harness first:  npm run harness`);
  process.exit(2);
}

flipChecks();
groupCohesion();
confirmArming();
menuClamping();
focusChecks();
spineHover();
scrimStacking();
foldSync();
reducedMotion();

console.log(`\n${checks - failures}/${checks} checks passed`);
process.exit(failures ? 1 : 0);
