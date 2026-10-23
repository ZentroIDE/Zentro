// SPDX-License-Identifier: GPL-3.0-only

/**
 * Eases mouse-wheel scrolling on one element.
 *
 * A Windows wheel notch scrolls a fixed ~100px in a single frame, which reads
 * as stepping. This accumulates notches into a target and glides the scroll
 * offset toward it on animation frames.
 *
 * It only takes over discrete wheel input. Trackpads already scroll smoothly
 * and natively (and off the main thread), so their events are left alone.
 */

export interface SmoothWheelOptions {
    /**
     * Axis the element scrolls along. The vertical wheel drives both: on `'x'`
     * it turns a vertical wheel into horizontal scrolling (tab strips), and
     * vertical trackpad swipes are still converted there, just without easing.
     */
    axis: 'x' | 'y';
    /**
     * True while the scroll offset is being moved on purpose by code that shares
     * this element (e.g. a virtualized list compensating for evicted rows). Such
     * a shift is folded into the glide instead of ending it.
     */
    isProgrammaticScroll?: () => boolean;
}

/** Time constant of the glide: the remaining distance shrinks by 1/e every TAU ms. */
const TAU_MS = 80;
/** Below this many pixels from the target the glide snaps to it and stops. */
const SETTLE_PX = 0.5;
/** How far the scroll offset may move on its own before we treat it as someone else's write. */
const EXTERNAL_TOLERANCE_PX = 1.5;
/** Notches accumulate, but never let the target run further ahead than this. */
const MAX_LEAD_PX = 2400;
/** Wheel notches are ~100px; trackpads and smooth-scroll mice send small steps. */
const DISCRETE_MIN_DELTA_PX = 50;
/** After a small delta shows up, treat input as a trackpad for this long. */
const TRACKPAD_HOLD_MS = 400;
const LINE_PX = 40;
/** Cap a frame's elapsed time so a stalled tab does not jump the glide to the end. */
const MAX_FRAME_MS = 50;

const prefersReducedMotion = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Attaches the glide to `el`. Returns a function that detaches it. */
export function attachSmoothWheelScroll(
    el: HTMLElement,
    getOptions: () => SmoothWheelOptions,
): () => void {
    let frameId: number | null = null;
    let current = 0;
    let target = 0;
    // What the offset read back as after our last write. Browsers round scroll
    // offsets, so comparing against this rather than `current` avoids mistaking
    // rounding for someone else moving the element.
    let lastSeen = 0;
    let lastFrameTime = 0;
    let trackpadUntil = 0;

    const isX = () => getOptions().axis === 'x';
    const read = () => (isX() ? el.scrollLeft : el.scrollTop);
    const write = (value: number) => {
        if (isX()) el.scrollLeft = value;
        else el.scrollTop = value;
    };
    const maxOffset = () =>
        isX() ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
    const pageSize = () => (isX() ? el.clientWidth : el.clientHeight);

    const stop = () => {
        if (frameId !== null) cancelAnimationFrame(frameId);
        frameId = null;
    };

    const step = (now: number) => {
        frameId = null;

        const actual = read();
        const drift = actual - lastSeen;
        if (Math.abs(drift) > EXTERNAL_TOLERANCE_PX) {
            // Someone else moved the element: the user dragged the scrollbar or
            // pressed a key, or code compensated the offset. The first ends the
            // glide; the second is carried along with it.
            if (!getOptions().isProgrammaticScroll?.()) return;
            target += drift;
            current = actual;
        }

        const dt = Math.min(Math.max(now - lastFrameTime, 1), MAX_FRAME_MS);
        lastFrameTime = now;

        const remaining = target - current;
        if (Math.abs(remaining) <= SETTLE_PX) {
            write(target);
            return;
        }
        current += remaining * (1 - Math.exp(-dt / TAU_MS));
        write(current);
        lastSeen = read();
        frameId = requestAnimationFrame(step);
    };

    const onWheel = (event: WheelEvent) => {
        if (event.defaultPrevented || event.ctrlKey || event.metaKey) return;
        if (prefersReducedMotion()) return;

        const axis = getOptions().axis;
        const rawDelta = event.deltaY;
        // A sideways swipe belongs to the browser, and so does Shift+wheel on a
        // vertical scroller (it scrolls horizontally there).
        if (rawDelta === 0 || Math.abs(event.deltaX) > Math.abs(rawDelta)) return;
        if (axis === 'y' && event.shiftKey) return;

        const delta =
            event.deltaMode === 1
                ? rawDelta * LINE_PX
                : event.deltaMode === 2
                  ? rawDelta * pageSize()
                  : rawDelta;

        const now = performance.now();
        if (event.deltaMode === 0 && Math.abs(delta) < DISCRETE_MIN_DELTA_PX) {
            trackpadUntil = now + TRACKPAD_HOLD_MS;
        }
        if (now < trackpadUntil) {
            stop();
            // A vertical swipe over a horizontal strip has nothing else to do,
            // so keep converting it, unanimated.
            if (axis === 'x') {
                event.preventDefault();
                el.scrollLeft += delta;
            }
            return;
        }

        const limit = Math.max(0, maxOffset());
        const start = frameId === null ? read() : target;
        const next = Math.min(Math.max(start + delta, 0), limit);
        // Already at the edge and pushing into it: let the event chain to the parent.
        if (next === start && frameId === null) return;

        event.preventDefault();

        if (frameId === null) {
            current = read();
            target = current;
            lastSeen = current;
            lastFrameTime = now;
        }
        target = Math.min(Math.max(next, current - MAX_LEAD_PX), current + MAX_LEAD_PX);
        if (frameId === null) frameId = requestAnimationFrame(step);
    };

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => {
        el.removeEventListener('wheel', onWheel);
        stop();
    };
}
