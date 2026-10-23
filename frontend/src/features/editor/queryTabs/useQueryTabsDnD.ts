// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    DragEndEvent,
    DragStartEvent,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';

import type { Tab } from '../../../stores/editorStore';
import type { TabGroup } from '../../../stores/editor/types';
import { TabGroupSplitDirection } from '../../../stores/editor/types';

interface UseQueryTabsDnDArgs {
    groups: TabGroup[];
    moveTab: (
        tabId: string,
        sourceGroupId: string,
        targetGroupId: string,
        newIndex: number,
    ) => void;
    splitGroupFromDrag: (
        sourceGroupId: string,
        tabId: string,
        targetGroupId: string,
        direction: TabGroupSplitDirection,
    ) => void;
    setActiveGroupId: (groupId: string) => void;
}

export function useQueryTabsDnD({
    groups,
    moveTab,
    splitGroupFromDrag,
    setActiveGroupId,
}: UseQueryTabsDnDArgs) {
    const [activeDragTab, setActiveDragTab] = React.useState<Tab | null>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 5,
            },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    const handleDragStart = React.useCallback(
        (event: DragStartEvent) => {
            const { active } = event;
            if (active.data.current?.type !== 'Tab') {
                return;
            }

            setActiveDragTab(active.data.current.tab);
            setActiveGroupId(active.data.current.groupId);
        },
        [setActiveGroupId],
    );

    const handleDragEnd = React.useCallback(
        (event: DragEndEvent) => {
            setActiveDragTab(null);
            const { active, over } = event;
            if (!over) return;

            const activeId = active.id as string;
            const overId = over.id as string;
            if (activeId === overId) return;

            const activeData = active.data.current;
            const overData = over.data.current;
            if (!activeData || !overData) return;

            const sourceGroupId = activeData.groupId;

            if (overData.type === 'Tab') {
                const targetGroupId = overData.groupId;
                const targetGroup = groups.find(group => group.id === targetGroupId);
                if (!targetGroup) return;

                moveTab(
                    activeId,
                    sourceGroupId,
                    targetGroupId,
                    targetGroup.tabs.findIndex(tab => tab.id === overId),
                );
                return;
            }

            if (overData.type === 'Group') {
                const targetGroupId = overData.groupId;
                const targetGroup = groups.find(group => group.id === targetGroupId);
                if (!targetGroup) return;

                moveTab(activeId, sourceGroupId, targetGroupId, targetGroup.tabs.length);
                return;
            }

            if (overData.type === 'SplitLeft' || overData.type === 'SplitRight') {
                const targetGroupId = overData.groupId;
                const direction =
                    overData.type === 'SplitLeft'
                        ? TabGroupSplitDirection.LEFT
                        : TabGroupSplitDirection.RIGHT;
                splitGroupFromDrag(sourceGroupId, activeId, targetGroupId, direction);
            }
        },
        [groups, moveTab, splitGroupFromDrag],
    );

    return {
        activeDragTab,
        sensors,
        handleDragStart,
        handleDragEnd,
    };
}
