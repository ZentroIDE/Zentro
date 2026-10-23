// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachSmoothWheelScroll, type SmoothWheelOptions } from './smoothWheelScroll';

const FRAME_MS = 16;

let clock = 0;
let queue: Array<{ id: number; cb: FrameRequestCallback }> = [];
let nextId = 1;

function runFrame() {
    clock += FRAME_MS;
    const pending = queue;
    queue = [];
    pending.forEach(({ cb }) => cb(clock));
}

/** Runs frames until nothing is scheduled (or the safety cap is hit). */
function settle(maxFrames = 400) {
    let frames = 0;
    while (queue.length > 0 && frames < maxFrames) {
        runFrame();
        frames += 1;
    }
    return frames;
}

interface FakeScroller {
    el: HTMLDivElement;
    offset: () => number;
    /** A write from outside the glide (scrollbar drag, keyboard, programmatic). */
    setOffset: (value: number) => void;
}

/** jsdom has no layout, so give the element a scrollable range and real offsets. */
function makeScroller(axis: 'x' | 'y', { size = 1000, viewport = 200 } = {}): FakeScroller {
    const el = document.createElement('div');
    let offset = 0;
    const max = size - viewport;
    const clamp = (v: number) => Math.min(Math.max(v, 0), max);
    const prop = axis === 'y' ? 'scrollTop' : 'scrollLeft';
    Object.defineProperty(el, prop, {
        configurable: true,
        get: () => offset,
        set: (v: number) => {
            offset = clamp(v);
        },
    });
    Object.defineProperty(el, axis === 'y' ? 'scrollHeight' : 'scrollWidth', { value: size });
    Object.defineProperty(el, axis === 'y' ? 'clientHeight' : 'clientWidth', { value: viewport });
    document.body.appendChild(el);
    return { el, offset: () => offset, setOffset: v => (offset = clamp(v)) };
}

function wheel(el: HTMLElement, init: WheelEventInit = {}) {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
    el.dispatchEvent(event);
    return event;
}

describe('attachSmoothWheelScroll', () => {
    let dispose: (() => void) | undefined;
    let reducedMotion = false;

    const attach = (el: HTMLElement, options: SmoothWheelOptions) => {
        dispose = attachSmoothWheelScroll(el, () => options);
    };

    beforeEach(() => {
        clock = 1000;
        queue = [];
        nextId = 1;
        reducedMotion = false;
        vi.spyOn(performance, 'now').mockImplementation(() => clock);
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            const id = nextId++;
            queue.push({ id, cb });
            return id;
        });
        vi.stubGlobal('cancelAnimationFrame', (id: number) => {
            queue = queue.filter(entry => entry.id !== id);
        });
        vi.stubGlobal('matchMedia', () => ({ matches: reducedMotion }));
    });

    afterEach(() => {
        dispose?.();
        dispose = undefined;
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('vertical scroller', () => {
        it('glides toward the target over several frames instead of jumping', () => {
            const { el, offset } = makeScroller('y');
            attach(el, { axis: 'y' });

            const event = wheel(el, { deltaY: 100 });

            expect(event.defaultPrevented).toBe(true);
            expect(offset()).toBe(0);

            runFrame();
            const afterOneFrame = offset();
            expect(afterOneFrame).toBeGreaterThan(0);
            expect(afterOneFrame).toBeLessThan(100);

            settle();
            expect(offset()).toBe(100);
        });

        it('moves less each frame as it nears the target', () => {
            const { el, offset } = makeScroller('y');
            attach(el, { axis: 'y' });
            wheel(el, { deltaY: 100 });

            const steps: number[] = [];
            let previous = 0;
            for (let i = 0; i < 4; i += 1) {
                runFrame();
                steps.push(offset() - previous);
                previous = offset();
            }

            for (let i = 1; i < steps.length; i += 1) {
                expect(steps[i]).toBeLessThan(steps[i - 1]);
            }
        });

        it('accumulates notches that arrive mid-glide', () => {
            const { el, offset } = makeScroller('y');
            attach(el, { axis: 'y' });

            wheel(el, { deltaY: 100 });
            runFrame();
            wheel(el, { deltaY: 100 });
            wheel(el, { deltaY: 100 });
            settle();

            expect(offset()).toBe(300);
        });

        it('supports scrolling back up', () => {
            const { el, offset, setOffset } = makeScroller('y');
            setOffset(400);
            attach(el, { axis: 'y' });

            wheel(el, { deltaY: -100 });
            settle();

            expect(offset()).toBe(300);
        });

        it('stops at the end of the scroll range', () => {
            const { el, offset } = makeScroller('y', { size: 1000, viewport: 200 });
            attach(el, { axis: 'y' });

            for (let i = 0; i < 12; i += 1) wheel(el, { deltaY: 100 });
            settle();

            expect(offset()).toBe(800);
        });

        it('scales line-mode deltas to pixels', () => {
            const { el, offset } = makeScroller('y');
            attach(el, { axis: 'y' });

            wheel(el, { deltaY: 3, deltaMode: 1 });
            settle();

            expect(offset()).toBe(120);
        });

        it('scales page-mode deltas by the viewport', () => {
            const { el, offset } = makeScroller('y', { size: 2000, viewport: 200 });
            attach(el, { axis: 'y' });

            wheel(el, { deltaY: 1, deltaMode: 2 });
            settle();

            expect(offset()).toBe(200);
        });

        it('lets the event through when already at the edge it is pushing into', () => {
            const { el, offset } = makeScroller('y');
            attach(el, { axis: 'y' });

            const event = wheel(el, { deltaY: -100 });

            expect(event.defaultPrevented).toBe(false);
            expect(offset()).toBe(0);
            expect(queue).toHaveLength(0);
        });
    });

    describe('input it leaves to the browser', () => {
        it('ignores small deltas (trackpads scroll smoothly on their own)', () => {
            const { el, offset } = makeScroller('y');
            attach(el, { axis: 'y' });

            const event = wheel(el, { deltaY: 12 });

            expect(event.defaultPrevented).toBe(false);
            expect(queue).toHaveLength(0);
            expect(offset()).toBe(0);
        });

        it('keeps treating input as a trackpad for a moment after a small delta', () => {
            const { el } = makeScroller('y');
            attach(el, { axis: 'y' });

            wheel(el, { deltaY: 8 });
            clock += 100;
            const event = wheel(el, { deltaY: 90 });

            expect(event.defaultPrevented).toBe(false);
        });

        it('goes back to easing once the trackpad has been quiet', () => {
            const { el } = makeScroller('y');
            attach(el, { axis: 'y' });

            wheel(el, { deltaY: 8 });
            clock += 1000;
            const event = wheel(el, { deltaY: 100 });

            expect(event.defaultPrevented).toBe(true);
        });

        it('stops an in-flight glide when a trackpad takes over', () => {
            const { el } = makeScroller('y');
            attach(el, { axis: 'y' });
            wheel(el, { deltaY: 100 });
            expect(queue).toHaveLength(1);

            wheel(el, { deltaY: 5 });

            expect(queue).toHaveLength(0);
        });

        it('ignores Ctrl+wheel (zoom)', () => {
            const { el } = makeScroller('y');
            attach(el, { axis: 'y' });

            const event = wheel(el, { deltaY: 100, ctrlKey: true });

            expect(event.defaultPrevented).toBe(false);
        });

        it('ignores Shift+wheel on a vertical scroller', () => {
            const { el } = makeScroller('y');
            attach(el, { axis: 'y' });

            const event = wheel(el, { deltaY: 100, shiftKey: true });

            expect(event.defaultPrevented).toBe(false);
        });

        it('ignores a sideways swipe', () => {
            const { el } = makeScroller('y');
            attach(el, { axis: 'y' });

            const event = wheel(el, { deltaX: 120, deltaY: 10 });

            expect(event.defaultPrevented).toBe(false);
        });

        it('does nothing when the user prefers reduced motion', () => {
            reducedMotion = true;
            const { el, offset } = makeScroller('y');
            attach(el, { axis: 'y' });

            const event = wheel(el, { deltaY: 100 });

            expect(event.defaultPrevented).toBe(false);
            expect(queue).toHaveLength(0);
            expect(offset()).toBe(0);
        });
    });

    describe('when something else moves the offset', () => {
        it('gives up the glide when the user drags the scrollbar', () => {
            const { el, offset, setOffset } = makeScroller('y');
            attach(el, { axis: 'y' });
            wheel(el, { deltaY: 300 });
            runFrame();

            setOffset(700);
            settle();

            expect(offset()).toBe(700);
        });

        it('carries a programmatic shift along with the glide', () => {
            const { el, offset, setOffset } = makeScroller('y');
            let programmatic = false;
            attach(el, { axis: 'y', isProgrammaticScroll: () => programmatic });
            wheel(el, { deltaY: 300 });
            runFrame();
            const before = offset();

            // e.g. a virtualized list dropped 100px of rows above the viewport.
            programmatic = true;
            setOffset(before + 100);
            settle();

            expect(offset()).toBe(400);
        });

        it('starts the next glide from where the element actually is', () => {
            const { el, offset, setOffset } = makeScroller('y');
            attach(el, { axis: 'y' });
            wheel(el, { deltaY: 300 });
            runFrame();
            setOffset(500);
            settle();

            wheel(el, { deltaY: 100 });
            settle();

            expect(offset()).toBe(600);
        });
    });

    describe('horizontal scroller driven by the vertical wheel', () => {
        it('turns a wheel notch into a horizontal glide', () => {
            const { el, offset } = makeScroller('x');
            attach(el, { axis: 'x' });

            const event = wheel(el, { deltaY: 100 });

            expect(event.defaultPrevented).toBe(true);
            expect(offset()).toBe(0);
            settle();
            expect(offset()).toBe(100);
        });

        it('still converts a small trackpad swipe, immediately', () => {
            const { el, offset } = makeScroller('x');
            attach(el, { axis: 'x' });

            const event = wheel(el, { deltaY: 12 });

            expect(event.defaultPrevented).toBe(true);
            expect(offset()).toBe(12);
            expect(queue).toHaveLength(0);
        });

        it('leaves a genuine horizontal swipe to the browser', () => {
            const { el } = makeScroller('x');
            attach(el, { axis: 'x' });

            const event = wheel(el, { deltaX: 80, deltaY: 5 });

            expect(event.defaultPrevented).toBe(false);
        });

        it('does not mind Shift being held', () => {
            const { el } = makeScroller('x');
            attach(el, { axis: 'x' });

            const event = wheel(el, { deltaY: 100, shiftKey: true });

            expect(event.defaultPrevented).toBe(true);
        });
    });

    it('detaches its listener and cancels a pending frame on dispose', () => {
        const { el, offset } = makeScroller('y');
        attach(el, { axis: 'y' });
        wheel(el, { deltaY: 100 });
        expect(queue).toHaveLength(1);

        dispose?.();
        dispose = undefined;

        expect(queue).toHaveLength(0);
        const event = wheel(el, { deltaY: 100 });
        expect(event.defaultPrevented).toBe(false);
        expect(offset()).toBe(0);
    });

    it('reads its options fresh on every event', () => {
        const { el } = makeScroller('y');
        // Scrollable along both axes so the switch below has somewhere to go.
        let scrollLeft = 0;
        Object.defineProperty(el, 'scrollLeft', {
            configurable: true,
            get: () => scrollLeft,
            set: (v: number) => (scrollLeft = v),
        });
        Object.defineProperty(el, 'scrollWidth', { value: 1000 });
        Object.defineProperty(el, 'clientWidth', { value: 200 });
        const options: SmoothWheelOptions = { axis: 'y' };
        dispose = attachSmoothWheelScroll(el, () => options);

        expect(wheel(el, { deltaY: 100, shiftKey: true }).defaultPrevented).toBe(false);
        options.axis = 'x';
        expect(wheel(el, { deltaY: 100, shiftKey: true }).defaultPrevented).toBe(true);
    });
});
