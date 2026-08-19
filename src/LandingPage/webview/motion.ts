/**
 * Motion tokens and the surface anchoring that has to agree with them.
 *
 * The durations are read from the stylesheet rather than restated here, so CSS stays the single
 * source (D013). `stillness()` is the JS half of the reduced-motion rule.
 */
import { useLayoutEffect, useRef, useState } from 'preact/hooks';


/**
 * Whether motion should be suppressed for this user.
 *
 * The two JS animations on this page - the FLIP card flight and the group's height - both move
 * things, which is exactly what reduced motion asks us to stop doing, so both are skipped
 * outright rather than shortened. The CSS half of the same decision lives in the
 * `prefers-reduced-motion` block of landingpage.scss, and it is deliberately *not* a blanket
 * off switch: colour and opacity still respond there, because they are feedback rather than
 * movement.
 *
 * Queried per call rather than cached. It is a single `matchMedia` against a query the browser
 * already has evaluated, it runs a handful of times per render at most, and caching it in a
 * module-level constant would leave the page moving until reload for anyone who changes the
 * setting while it is open.
 */
export function stillness() {return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}


/**
 * The JS animations on this page - the FLIP card flight and the group's height - are the same
 * gestures as the CSS ones and must be timed like them, so they read their duration and curve
 * from the same `--dur-*` / `--ease-move` tokens rather than restating the numbers. Both were
 * hand-typed here before, which is exactly how a page ends up with a 220ms transform next to a
 * 200ms one and a vague sense that something is out of step.
 *
 * The duration is a parameter because the group's height is not always the same gesture. A fold,
 * a layout switch and a filter are all considered changes and take `--dur-move`; the space that
 * opens under a dragged bookmark is pointer feedback and takes `--dur-hover`, because the cards
 * sliding into that space are transitioned at `--dur-hover` and the box containing them has to
 * arrive when they do. It did not: measured against the harness, the cards settled at 150ms and
 * the group carried on growing until 212ms, so everything below it was still being pushed down
 * for 62ms after the movement that caused it had visibly finished, and the board appeared to
 * settle twice. Same defect as the fold chevron finishing ahead of the group it describes, from
 * the opposite direction.
 *
 * Read once per token and cached: these are custom properties on `.landingpage`, which is
 * rendered once and never re-themed, and `getComputedStyle` inside the layout effects that use
 * this would put a style resolution on the path of every render. The fallbacks cover only the
 * first call happening before the element is mounted - the tokens themselves always exist.
 */
export const motionTokens = new Map<string,{duration:number; easing:string}>();

export const motionFallback:Record<string,number> = {'--dur-move':220, '--dur-hover':150, '--dur-arm':300};

export function motion(token:'--dur-move'|'--dur-hover'|'--dur-arm'='--dur-move') {
  const cached = motionTokens.get(token);
  if (cached) {return cached;}
  const fallback = {duration:motionFallback[token], easing:'cubic-bezier(.2, .7, .3, 1)'};
  const page = document.querySelector('.landingpage');
  if (!page) {return fallback;}
  const style = getComputedStyle(page);
  // The durations are authored in CSS time syntax (`.22s`); WAAPI wants milliseconds.
  const seconds = parseFloat(style.getPropertyValue(token));
  const resolved = {
    duration: Number.isFinite(seconds) ? seconds*1000 : fallback.duration,
    easing: style.getPropertyValue('--ease-move').trim() || fallback.easing,
  };
  motionTokens.set(token, resolved);
  return resolved;
}

/**
 * Places a surface that opens at the pointer - the action menu and the two palettes - and keeps
 * it on screen.
 *
 * These were positioned with a plain inline `left`/`top` at the raw click coordinates and never
 * measured, so a right-click near the bottom-right corner opened a menu that ran off both edges:
 * at a 1280x577 viewport, 164px past the right edge and 250px below the bottom, with most of
 * the items unreachable. Flipping to the other side of the pointer is the standard fix and is
 * what the hover popover already did for its own vertical overflow.
 *
 * It also records which corner the surface ended up growing from, as `--origin-x`/`--origin-y`,
 * because that is the corner the entrance animation has to scale out of. A menu that flipped
 * above the pointer but still scaled from its top-left would expand downwards, away from the
 * click - the exact thing the animation exists to avoid.
 *
 * `useLayoutEffect` rather than `useEffect`: this runs after the surface has a box to measure
 * but before the browser paints, so the corrected position is the first one on screen and there
 * is no frame at the unclamped coordinates.
 */
export function useAnchored(x:number, y:number) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) {return;}
    const place = () => {
      const margin = 8;
      // Safe to measure at the unclamped position: both surfaces size to their content and are
      // `position: fixed`, so neither is squeezed by being partly off screen.
      const box = element.getBoundingClientRect();
      const flipX = x + box.width > window.innerWidth - margin;
      const flipY = y + box.height > window.innerHeight - margin;
      // `Math.max` for the surface that fits on neither side - it is pinned to the near edge
      // rather than pushed off the opposite one.
      element.style.left = `${flipX ? Math.max(margin, x - box.width) : x}px`;
      element.style.top = `${flipY ? Math.max(margin, y - box.height) : y}px`;
      element.style.setProperty('--origin-x', flipX ? 'right' : 'left');
      element.style.setProperty('--origin-y', flipY ? 'bottom' : 'top');
    };
    place();

    // Placing once is not enough, because these surfaces change size while they are open. The
    // action menu swaps its Remove row for a confirmation *and* a Cancel row, and the rename
    // row is taller than the button it replaces. A menu that was clamped to sit just inside the
    // bottom margin then grew straight back out of it - measured at 14px past the edge, with
    // Cancel the item that fell off, which is the one item that must never be unreachable.
    //
    // `x` and `y` do not change when that happens, so the effect does not re-run and there is
    // nothing else to notice it. A ResizeObserver watches the box itself. It cannot loop here:
    // `place()` only ever writes `left`/`top`, never anything that affects size.
    const resize = new ResizeObserver(place);
    resize.observe(element);
    // The viewport can move out from under an open surface too - the webview is a panel the
    // user can drag-resize at any time.
    window.addEventListener('resize', place);
    return () => {resize.disconnect(); window.removeEventListener('resize', place);};
  },[x,y]);
  return ref;
}
