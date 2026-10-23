// SPDX-License-Identifier: GPL-3.0-only

import { useEffect, useRef, type RefObject } from 'react';
import { attachSmoothWheelScroll, type SmoothWheelOptions } from '../lib/smoothWheelScroll';

/**
 * Eases mouse-wheel scrolling on the element behind `ref`. Options are read
 * fresh on every wheel event, so callers can pass an inline object without
 * re-attaching the listener.
 */
export function useSmoothWheelScroll(
    ref: RefObject<HTMLElement | null>,
    options: SmoothWheelOptions,
) {
    const optionsRef = useRef(options);
    optionsRef.current = options;

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        return attachSmoothWheelScroll(el, () => optionsRef.current);
    }, [ref]);
}
