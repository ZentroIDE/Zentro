// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * jsdom performs no layout, so the real virtualizer measures a zero-height
 * scroll element and mounts nothing (verified separately). Every virtualized
 * suite in this repo mocks it for that reason; these tests therefore assert the
 * wiring — the row list handed to the virtualizer, and which rows it renders —
 * rather than the virtualizer's own geometry.
 */
let virtualRowIndexes: number[] = [];
let virtualizerCount = 0;
const measure = vi.fn();
const scrollToIndex = vi.fn();

vi.mock('@tanstack/react-virtual', () => ({
    useVirtualizer: ({ count }: { count: number }) => {
        virtualizerCount = count;
        return {
            getVirtualItems: () =>
                virtualRowIndexes.map(index => ({
                    index,
                    key: index,
                    start: index * 28,
                    end: (index + 1) * 28,
                })),
            getTotalSize: () => count * 28,
            measure,
            scrollToIndex,
        };
    },
}));

import { CATEGORY_KEY, type CategoryGroupNode } from '../databaseExplorerTypes';
import { OBJECT_TYPE } from '../../../lib/constants';
import { ExplorerList } from './ExplorerList';

const OBJECT_COUNT = 5000;

function bigCategory(): CategoryGroupNode {
    return {
        id: CATEGORY_KEY.TABLES,
        key: CATEGORY_KEY.TABLES,
        label: 'Tables',
        icon: 'table',
        itemIcon: 'table',
        totalCount: OBJECT_COUNT,
        canOpenDefinition: true,
        allowCreateTable: true,
        dropObjectType: OBJECT_TYPE.TABLE,
        schemas: [
            {
                id: `tables:dbo`,
                schemaName: 'dbo',
                totalCount: OBJECT_COUNT,
                items: Array.from({ length: OBJECT_COUNT }, (_, index) => ({
                    id: `tables:dbo:Table_${index}`,
                    name: `Table_${index}`,
                    schemaName: 'dbo',
                    categoryKey: CATEGORY_KEY.TABLES,
                    categoryLabel: 'Tables',
                })),
            },
        ],
    } satisfies CategoryGroupNode;
}

const noop = () => undefined;

function renderList(overrides: Record<string, unknown> = {}) {
    const scrollRef = React.createRef<HTMLDivElement>();
    const onScrollToIndexReady = vi.fn();
    const utils = render(
        <div ref={scrollRef}>
            <ExplorerList
                category={bigCategory()}
                isSchemaExpanded={() => true}
                isFiltering={false}
                scrollRef={scrollRef}
                onScrollToIndexReady={onScrollToIndexReady}
                emptyMessage='No objects'
                driver='sqlserver'
                readOnlyMode={false}
                selectedObjectKey={null}
                onToggleSchema={noop}
                onCreateTable={noop}
                onSelectObject={noop}
                onOpenDefinition={noop}
                onOpenCatalog={noop}
                onDropObject={async () => undefined}
                onTruncateTable={async () => undefined}
                onRefreshSchema={async () => undefined}
                onExportData={noop}
                onImportData={noop}
                {...overrides}
            />
        </div>,
    );
    return { ...utils, scrollRef, onScrollToIndexReady };
}

describe('ExplorerList virtualization', () => {
    beforeEach(() => {
        virtualRowIndexes = [0, 1, 2];
        scrollToIndex.mockClear();
    });

    it('hands the virtualizer the whole flattened list, not just the mounted rows', () => {
        renderList();

        // Header + 5000 objects.
        expect(virtualizerCount).toBe(OBJECT_COUNT + 1);
    });

    it('mounts only the rows the virtualizer reports', () => {
        // Index 0 is the schema header, so these are Table_0 / Table_1.
        renderList();

        expect(screen.getByText('Table_0')).toBeInTheDocument();
        expect(screen.getByText('Table_1')).toBeInTheDocument();
        // Outside the reported range, so never mounted at all. This is what
        // keeps a keystroke's cost proportional to the viewport rather than to
        // the catalog size.
        expect(screen.queryByText('Table_2')).not.toBeInTheDocument();
        expect(screen.queryByText('Table_4999')).not.toBeInTheDocument();
    });

    it('renders a mounted object row with its selection key', () => {
        virtualRowIndexes = [1];
        const { container } = renderList();

        const row = container.querySelector('[data-object-key="tables:dbo.Table_0"]');
        expect(row).not.toBeNull();
    });

    it('shows the empty message and mounts nothing when there are no rows', () => {
        const { container } = renderList({
            category: {
                ...bigCategory(),
                schemas: [],
            },
            isSchemaExpanded: () => false,
        });

        expect(screen.getByText('No objects')).toBeInTheDocument();
        expect(container.querySelector('[data-explorer-row]')).toBeNull();
    });

    it('puts tabindex 0 on the first object result while filtering', () => {
        const { container } = renderList({ isFiltering: true });

        expect(container.querySelector('[data-object-key="schema:tables:dbo"]')).toHaveAttribute(
            'tabindex',
            '-1',
        );
        expect(container.querySelector('[data-object-key="tables:dbo.Table_0"]')).toHaveAttribute(
            'tabindex',
            '0',
        );
        expect(scrollToIndex).toHaveBeenCalledWith(1, { align: 'auto' });
    });

    it('keeps a tab stop on the first mounted row when the focused row is off-screen', () => {
        virtualRowIndexes = [4, 5];
        const { container } = renderList();

        expect(container.querySelector('[data-object-key="tables:dbo.Table_3"]')).toHaveAttribute(
            'tabindex',
            '0',
        );
        expect(container.querySelector('[data-object-key="tables:dbo.Table_4"]')).toHaveAttribute(
            'tabindex',
            '-1',
        );
    });

    it('arrow up from the first row returns focus to the categories', () => {
        const onExitUp = vi.fn();
        const { container } = renderList({ onExitUp });

        const schema = container.querySelector('[data-object-key="schema:tables:dbo"]');
        fireEvent.keyDown(schema as HTMLElement, { key: 'ArrowUp' });

        expect(onExitUp).toHaveBeenCalledTimes(1);
    });

    it('exposes scroll-to-index so a selection can reveal an off-screen row', () => {
        const { onScrollToIndexReady } = renderList();

        expect(onScrollToIndexReady).toHaveBeenCalledTimes(1);
        const scrollTo = onScrollToIndexReady.mock.calls[0][0] as (index: number) => void;
        scrollTo(4200);

        expect(scrollToIndex).toHaveBeenCalledWith(4200, { align: 'center' });
    });
});
