// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { guardResultLeave, registerResultUnsavedGate } from './resultUnsavedGate';

const controller = (hasUnsaved: boolean) => ({
    hasUnsaved: vi.fn(() => hasUnsaved),
    request: vi.fn(),
});

const unmounted = (isDirty: boolean) => ({
    isDirty: vi.fn(() => isDirty),
    reveal: vi.fn(),
    onUnavailable: vi.fn(),
});

describe('guardResultLeave with an unmounted panel', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('proceeds straight away when the tab has no pending edits', () => {
        const proceed = vi.fn();
        const opts = unmounted(false);

        expect(guardResultLeave('t', 'close', proceed, opts)).toBe(true);

        expect(proceed).toHaveBeenCalledTimes(1);
        expect(opts.reveal).not.toHaveBeenCalled();
    });

    it('reveals the panel and waits, then asks once the panel registers', () => {
        const proceed = vi.fn();
        const opts = unmounted(true);

        expect(guardResultLeave('t', 'close', proceed, opts)).toBe(false);
        expect(opts.reveal).toHaveBeenCalledTimes(1);
        expect(proceed).not.toHaveBeenCalled();

        const panel = controller(true);
        const unregister = registerResultUnsavedGate('t', panel);

        expect(panel.request).toHaveBeenCalledWith('close', proceed);
        expect(proceed).not.toHaveBeenCalled();

        vi.advanceTimersByTime(5000);
        expect(opts.onUnavailable).not.toHaveBeenCalled();
        unregister();
    });

    it('runs the action if the panel comes up with nothing left to save', () => {
        const proceed = vi.fn();
        guardResultLeave('t', 'run', proceed, unmounted(true));

        const unregister = registerResultUnsavedGate('t', controller(false));

        expect(proceed).toHaveBeenCalledTimes(1);
        unregister();
    });

    it('drops the action and reports it when the panel never shows up', () => {
        const proceed = vi.fn();
        const opts = unmounted(true);
        guardResultLeave('t', 'close', proceed, opts);

        vi.advanceTimersByTime(1500);

        expect(opts.onUnavailable).toHaveBeenCalledTimes(1);
        expect(proceed).not.toHaveBeenCalled();

        // A panel mounting later must not resurrect the dropped action.
        const panel = controller(true);
        const unregister = registerResultUnsavedGate('t', panel);
        expect(panel.request).not.toHaveBeenCalled();
        unregister();
    });

    it('uses a mounted panel directly, without revealing anything', () => {
        const panel = controller(true);
        const unregister = registerResultUnsavedGate('t', panel);
        const proceed = vi.fn();
        const opts = unmounted(true);

        expect(guardResultLeave('t', 'close', proceed, opts)).toBe(false);

        expect(panel.request).toHaveBeenCalledWith('close', proceed);
        expect(opts.reveal).not.toHaveBeenCalled();
        unregister();
    });
});
