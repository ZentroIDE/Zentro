// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    hasTableInfoUnsavedChanges,
    registerTableInfoCloseController,
    requestTableInfoClose,
    subscribeTableInfoCloseRegistry,
} from './tableInfoCloseRegistry';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('tableInfoCloseRegistry', () => {
    it('requests inline close when the tab has unsaved changes', () => {
        const requestClose = vi.fn();
        const unregister = registerTableInfoCloseController('tab-1', {
            hasUnsavedChanges: () => true,
            requestClose,
        });

        expect(requestTableInfoClose('tab-1')).toBe('blocked');
        expect(requestClose).toHaveBeenCalledTimes(1);

        unregister();
    });

    it('does not request inline close when the tab is clean', () => {
        const requestClose = vi.fn();
        const unregister = registerTableInfoCloseController('tab-2', {
            hasUnsavedChanges: () => false,
            requestClose,
        });

        expect(requestTableInfoClose('tab-2')).toBe('close-now');
        expect(requestClose).not.toHaveBeenCalled();

        unregister();
    });

    it('notifies subscribers when dirty state is registered and removed', () => {
        const listener = vi.fn();
        const unsubscribe = subscribeTableInfoCloseRegistry(listener);

        const unregister = registerTableInfoCloseController('tab-3', {
            hasUnsavedChanges: () => true,
            requestClose: vi.fn(),
        });

        expect(listener).toHaveBeenCalled();
        expect(hasTableInfoUnsavedChanges('tab-3')).toBe(true);

        listener.mockClear();
        unregister();
        expect(listener).toHaveBeenCalled();
        expect(hasTableInfoUnsavedChanges('tab-3')).toBe(false);

        unsubscribe();
    });
});
