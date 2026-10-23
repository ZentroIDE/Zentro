// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { DOM_EVENT } from './constants';
import { emitCommand, onCommand } from './commandBus';

describe('commandBus', () => {
    it('emits and receives typed payload', () => {
        const handler = vi.fn();
        const off = onCommand(DOM_EVENT.RUN_QUERY_ACTION, handler);

        emitCommand(DOM_EVENT.RUN_QUERY_ACTION, { tabId: 'tab-1' });

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith({ tabId: 'tab-1' }, expect.any(CustomEvent));

        off();
    });

    it('unsubscribes listeners', () => {
        const handler = vi.fn();
        const off = onCommand(DOM_EVENT.OPEN_SCHEMA_DIFF, handler);
        off();

        emitCommand(DOM_EVENT.OPEN_SCHEMA_DIFF);
        expect(handler).not.toHaveBeenCalled();
    });

    it('supports optional context search intent payloads', () => {
        const handler = vi.fn();
        const off = onCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, handler);

        emitCommand(DOM_EVENT.OPEN_CONTEXT_SEARCH, {
            mode: 'schema-diff-source',
            targetSide: 'left',
            compareTabId: 'compare-tab-1',
            initialEnvironmentKey: 'dev',
            initialSchemaName: 'public',
        });

        expect(handler).toHaveBeenCalledWith(
            {
                mode: 'schema-diff-source',
                targetSide: 'left',
                compareTabId: 'compare-tab-1',
                initialEnvironmentKey: 'dev',
                initialSchemaName: 'public',
            },
            expect.any(CustomEvent),
        );

        off();
    });
});
