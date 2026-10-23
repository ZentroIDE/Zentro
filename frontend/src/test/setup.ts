// SPDX-License-Identifier: GPL-3.0-only

import '@testing-library/jest-dom';

class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
}

if (typeof globalThis.ResizeObserver === 'undefined') {
    globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
}

if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
}

// jsdom has no Pointer Capture API — Radix's DropdownMenu/Select trigger
// (open-on-pointerdown) calls these unconditionally, so without this a
// fireEvent.pointerDown on a trigger throws instead of opening the menu.
if (typeof Element !== 'undefined' && !Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
}

// jsdom has no global PointerEvent constructor, so testing-library's
// fireEvent.pointerDown/Up fall back to a plain Event whose `button`/
// `ctrlKey` are undefined — Radix's open-on-pointerdown handlers check
// `event.button === 0`, which then never matches and the menu never
// opens. A thin MouseEvent-based shim is enough: Radix never reads
// pointer-specific fields (pointerId/pointerType) for open/close.
if (typeof window !== 'undefined' && typeof window.PointerEvent === 'undefined') {
    class PointerEventPolyfill extends MouseEvent {
        pointerId: number;
        pointerType: string;
        isPrimary: boolean;
        constructor(type: string, params: PointerEventInit = {}) {
            super(type, params);
            this.pointerId = params.pointerId ?? 0;
            this.pointerType = params.pointerType ?? 'mouse';
            this.isPrimary = params.isPrimary ?? true;
        }
    }
    window.PointerEvent = PointerEventPolyfill as typeof PointerEvent;
}
