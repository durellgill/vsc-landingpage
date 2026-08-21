import { useLayoutEffect, useRef, useState } from 'preact/hooks';


/**
 * Reduced motion skips JS movement while preserving CSS feedback. Queries `matchMedia` per call so changes apply without reload.
 */
export function stillness() {return window.matchMedia('(prefers-reduced-motion: reduce)').matches;}


/**
 * JS animations read shared CSS timing tokens, and the caller chooses move versus hover duration. Resolved token values may be cached with pre-mount fallbacks.
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
  const seconds = parseFloat(style.getPropertyValue(token));
  const resolved = {
    duration: Number.isFinite(seconds) ? seconds*1000 : fallback.duration,
    easing: style.getPropertyValue('--ease-move').trim() || fallback.easing,
  };
  motionTokens.set(token, resolved);
  return resolved;
}

/**
 * Measures, flips, and clamps pointer-opened surfaces before paint. Records the corner nearest the trigger as their animation origin.
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
      // If a surface fits on neither side, pin it to the nearest viewport edge.
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
