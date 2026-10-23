// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { render, renderHook, screen } from '@testing-library/react';
import { useDataTableColumns } from './useDataTableColumns';
import { pluginRegistry } from '../../../lib/plugin/pluginRegistry';

const cleanupCallbacks: Array<() => void> = [];

afterEach(() => {
    while (cleanupCallbacks.length > 0) {
        cleanupCallbacks.pop()?.();
    }
});

describe('useDataTableColumns plugin integration', () => {
    it('renders a plugin cell renderer when the data type matches', () => {
        cleanupCallbacks.push(
            pluginRegistry.registerCellRenderer({
                pluginId: 'plugin.jsonb',
                dataType: 'jsonb',
                component: ({ value }) => <span>plugin:{String(value)}</span>,
            }),
        );

        const { result } = renderHook(() =>
            useDataTableColumns({
                dataColumns: [{ id: 'payload', index: 0, name: 'payload', columnKey: 'payload' }],
                dataTypeByColumn: new Map([['payload', 'JSONB']]),
                isEditable: false,
                readOnly: true,
                commitEdit: async () => undefined,
                emitSaveShortcut: () => undefined,
            }),
        );

        const payloadColumn = result.current[1];
        const cell = payloadColumn.cell as unknown as (
            info: Record<string, unknown>,
        ) => React.ReactNode;

        const cellNode = cell({
            row: {
                original: {
                    key: 'p:0',
                    kind: 'persisted',
                    values: ['{"hello":"world"}'],
                },
            },
            table: {
                options: {
                    meta: {},
                },
            },
            getValue: () => '{"hello":"world"}',
        });

        render(<>{cellNode}</>);

        expect(screen.getByText('plugin:{"hello":"world"}')).toBeInTheDocument();
    });
});
