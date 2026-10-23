// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { CornerDownRight } from 'lucide-react';

import { useEditorStore } from '../../../../stores/editorStore';
import { DOM_EVENT, TAB_TYPE } from '../../../../lib/constants';
import { emitCommand } from '../../../../lib/commandBus';
import { CommandEmpty, CommandItem } from '../../../ui';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

const GotoLineResults: React.FC<SearchModeResultsProps> = ({ query, onClose }) => {
    const { groups, activeGroupId } = useEditorStore();
    const activeGroup = groups.find(group => group.id === activeGroupId);
    const activeTab = activeGroup?.tabs.find(tab => tab.id === activeGroup.activeTabId);
    const targetTab = activeTab?.type === TAB_TYPE.QUERY ? activeTab : undefined;

    const lineNumber = Number.parseInt(query.trim(), 10);
    const isValidLine = Number.isInteger(lineNumber) && lineNumber > 0;

    if (!targetTab) {
        return <CommandEmpty>No active query tab.</CommandEmpty>;
    }

    if (!isValidLine) {
        return <CommandEmpty>Type a line number.</CommandEmpty>;
    }

    return (
        <CommandItem
            value={`goto:${lineNumber}`}
            onSelect={() => {
                emitCommand(DOM_EVENT.JUMP_TO_LINE_ACTION, {
                    tabId: targetTab.id,
                    line: lineNumber,
                });
                onClose();
            }}
        >
            <CornerDownRight size={12} className='shrink-0 text-muted-foreground' />
            <span>
                Go to line {lineNumber} in {targetTab.name}
            </span>
        </CommandItem>
    );
};

export const gotoLineMode: SearchModeDescriptor = {
    id: 'goto-line',
    prefix: ':',
    description: 'Jump to a line in the active query tab',
    placeholder: 'Type a line number...',
    dialogTitle: 'Go to Line',
    Results: GotoLineResults,
};
