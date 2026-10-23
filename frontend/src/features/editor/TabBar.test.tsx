// SPDX-License-Identifier: GPL-3.0-only

import { DndContext, closestCenter } from '@dnd-kit/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TAB_TYPE } from '../../lib/constants';
import { useResultStore } from '../../stores/resultStore';
import { TabBar } from './TabBar';
import { registerTableInfoCloseController } from './TableInfo/tableInfoCloseRegistry';

const toastState = {
    error: vi.fn(),
    success: vi.fn(),
};

vi.mock('../../components/layout/Toast', () => ({
    useToast: () => ({
        toast: toastState,
    }),
}));

vi.mock('@dnd-kit/core', () => ({
    DndContext: ({ children }: any) => <>{children}</>,
    closestCenter: vi.fn(),
    useDroppable: () => ({
        setNodeRef: vi.fn(),
        isOver: false,
        active: null,
    }),
}));

vi.mock('@dnd-kit/sortable', () => ({
    SortableContext: ({ children }: any) => <>{children}</>,
    horizontalListSortingStrategy: vi.fn(),
    useSortable: () => ({
        attributes: {},
        listeners: {},
        setNodeRef: vi.fn(),
        transform: null,
        transition: null,
        isDragging: false,
    }),
}));

vi.mock('@dnd-kit/utilities', () => ({
    CSS: {
        Transform: {
            toString: () => '',
        },
    },
}));

afterEach(() => {
    vi.clearAllMocks();
});

describe('TabBar', () => {
    it('shows an unsaved indicator for dirty table tabs', async () => {
        let unregister: () => void = () => undefined;
        act(() => {
            unregister = registerTableInfoCloseController('table-tab', {
                hasUnsavedChanges: () => true,
                requestClose: vi.fn(),
            });
        });

        render(
            <DndContext
                collisionDetection={closestCenter}
                onDragStart={() => undefined}
                onDragEnd={() => undefined}
            >
                <TabBar
                    groupId='group-1'
                    tabs={[
                        {
                            id: 'table-tab',
                            name: 'app.orders',
                            query: '',
                            isRunning: false,
                            type: TAB_TYPE.TABLE,
                            content: 'app.orders',
                        } as any,
                    ]}
                    activeTabId='table-tab'
                    onActivate={vi.fn()}
                    onClose={vi.fn()}
                    onNewTab={vi.fn()}
                    onRename={vi.fn()}
                />
            </DndContext>,
        );

        expect(await screen.findByLabelText('Unsaved changes')).toBeInTheDocument();

        act(() => {
            unregister();
        });
        await waitFor(() => {
            expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument();
        });
    });

    describe('query tab with unsaved result edits', () => {
        const renderQueryTab = () =>
            render(
                <DndContext
                    collisionDetection={closestCenter}
                    onDragStart={() => undefined}
                    onDragEnd={() => undefined}
                >
                    <TabBar
                        groupId='group-1'
                        tabs={[
                            {
                                id: 'query-tab',
                                name: 'New Query',
                                query: '',
                                isRunning: false,
                                type: TAB_TYPE.QUERY,
                            } as any,
                        ]}
                        activeTabId='other-tab'
                        onActivate={vi.fn()}
                        onClose={vi.fn()}
                        onNewTab={vi.fn()}
                        onRename={vi.fn()}
                    />
                </DndContext>,
            );

        afterEach(() => {
            act(() => useResultStore.setState({ results: {} }));
        });

        it('shows the unsaved indicator, even when the tab is not the active one', () => {
            useResultStore.setState({
                results: { 'query-tab': { pendingEdits: new Map([['0:1', 'x']]) } as any },
            });

            renderQueryTab();

            expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument();
        });

        it('shows nothing when the result has no pending edits', () => {
            useResultStore.setState({
                results: {
                    'query-tab': {
                        pendingEdits: new Map(),
                        pendingDeletions: new Set(),
                        pendingDraftRows: [],
                    } as any,
                },
            });

            renderQueryTab();

            expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument();
        });

        it('follows the store as edits are made and cleared', () => {
            renderQueryTab();
            expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument();

            act(() =>
                useResultStore.setState({
                    results: { 'query-tab': { pendingDeletions: new Set([3]) } as any },
                }),
            );
            expect(screen.getByLabelText('Unsaved changes')).toBeInTheDocument();

            act(() =>
                useResultStore.setState({
                    results: { 'query-tab': { pendingDeletions: new Set() } as any },
                }),
            );
            expect(screen.queryByLabelText('Unsaved changes')).not.toBeInTheDocument();
        });
    });

    it('shows a Pinned Environment badge (ADR-0001) on a table tab with a pinned connection', () => {
        render(
            <DndContext
                collisionDetection={closestCenter}
                onDragStart={() => undefined}
                onDragEnd={() => undefined}
            >
                <TabBar
                    groupId='group-1'
                    tabs={[
                        {
                            id: 'table-tab',
                            name: 'app.orders',
                            query: '',
                            isRunning: false,
                            type: TAB_TYPE.TABLE,
                            content: 'app.orders',
                            connection: {
                                profileName: 'prod-db',
                                dbName: 'app',
                                driver: 'postgres',
                                environmentKey: 'pro',
                            },
                        } as any,
                    ]}
                    activeTabId='table-tab'
                    onActivate={vi.fn()}
                    onClose={vi.fn()}
                    onNewTab={vi.fn()}
                    onRename={vi.fn()}
                />
            </DndContext>,
        );

        expect(screen.getByTitle('Pinned to Production')).toBeInTheDocument();
    });

    it('shows no Pinned Environment badge on a query tab (never pinned, ADR-0001)', () => {
        render(
            <DndContext
                collisionDetection={closestCenter}
                onDragStart={() => undefined}
                onDragEnd={() => undefined}
            >
                <TabBar
                    groupId='group-1'
                    tabs={[
                        {
                            id: 'query-tab',
                            name: 'New Query',
                            query: '',
                            isRunning: false,
                            type: TAB_TYPE.QUERY,
                        } as any,
                    ]}
                    activeTabId='query-tab'
                    onActivate={vi.fn()}
                    onClose={vi.fn()}
                    onNewTab={vi.fn()}
                    onRename={vi.fn()}
                />
            </DndContext>,
        );

        expect(screen.queryByTitle(/Pinned to/)).not.toBeInTheDocument();
    });

    describe('wheel scrolling', () => {
        const renderTabBar = () =>
            render(
                <DndContext
                    collisionDetection={closestCenter}
                    onDragStart={() => undefined}
                    onDragEnd={() => undefined}
                >
                    <TabBar
                        groupId='group-1'
                        tabs={[
                            {
                                id: 'query-tab',
                                name: 'New Query',
                                query: '',
                                isRunning: false,
                                type: TAB_TYPE.QUERY,
                            } as any,
                        ]}
                        activeTabId='query-tab'
                        onActivate={vi.fn()}
                        onClose={vi.fn()}
                        onNewTab={vi.fn()}
                        onRename={vi.fn()}
                    />
                </DndContext>,
            );

        const scroller = (container: HTMLElement) =>
            container.querySelector<HTMLElement>('.ui-scrollbar-hover')!;

        it('turns a vertical trackpad swipe into horizontal scrolling', () => {
            const { container } = renderTabBar();
            const event = new WheelEvent('wheel', { deltaY: 12, bubbles: true, cancelable: true });

            scroller(container).dispatchEvent(event);

            expect(event.defaultPrevented).toBe(true);
        });

        it('leaves a horizontal trackpad swipe to the browser', () => {
            const { container } = renderTabBar();
            const event = new WheelEvent('wheel', {
                deltaX: 80,
                deltaY: 5,
                bubbles: true,
                cancelable: true,
            });

            scroller(container).dispatchEvent(event);

            expect(event.defaultPrevented).toBe(false);
        });

        it('reveals the active tab with a smooth scroll', () => {
            const scrollIntoView = vi.fn();
            const original = Element.prototype.scrollIntoView;
            Element.prototype.scrollIntoView = scrollIntoView;
            try {
                renderTabBar();
            } finally {
                Element.prototype.scrollIntoView = original;
            }

            expect(scrollIntoView).toHaveBeenCalledWith({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest',
            });
        });
    });
});
