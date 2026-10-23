// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';

import { useConnectionStore } from '../../../../stores/connectionStore';
import { useEditorStore } from '../../../../stores/editorStore';
import { useProjectStore } from '../../../../stores/projectStore';
import { useScriptStore } from '../../../../stores/scriptStore';
import { useScriptSearchSummaryStore } from '../../../../stores/scriptSearchSummaryStore';
import { DOM_EVENT, TAB_TYPE } from '../../../../lib/constants';
import { emitCommand } from '../../../../lib/commandBus';
import { Button } from '../../../ui';
import { ScriptSearchResults } from '../../ScriptSearchResults';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

const ScriptSearchSummaryBar: React.FC<{ onReplaceQuery: (query: string) => void }> = ({
    onReplaceQuery,
}) => {
    const summary = useScriptSearchSummaryStore(state => state.summary);
    if (!summary) return null;

    return (
        <div className='absolute top-5 right-3 -translate-y-1/2 inline-flex items-center gap-1'>
            <span className='text-small text-muted-foreground inline-flex select-all items-center gap-1'>
                Found {summary.matchCount} {summary.matchCount === 1 ? 'match' : 'matches'} in{' '}
                {summary.fileCount} {summary.fileCount === 1 ? 'file' : 'files'}
            </span>
            <Button
                type='button'
                variant='link'
                className='text-label border-none!'
                onClick={() => onReplaceQuery('# ')}
            >
                Clear
            </Button>
        </div>
    );
};

const ScriptResults: React.FC<SearchModeResultsProps> = ({ query, onClose }) => {
    const activeProfile = useConnectionStore(state => state.activeProfile);
    const activeProject = useProjectStore(state => state.activeProject);
    const { addTab, groups, setActiveGroupId, setActiveTabId } = useEditorStore();

    const projectId = activeProject?.id ?? '';
    const connectionName = activeProfile?.name || '';

    const handleOpenScript = React.useCallback(
        async (scriptId: string, scriptName: string, content: string, lineNumber?: number) => {
            const resolvedContent =
                content ||
                (await useScriptStore
                    .getState()
                    .getContent(projectId, connectionName, scriptId)
                    .catch(() => ''));

            const existing = groups
                .flatMap(group => group.tabs)
                .find(tab => tab.type === 'query' && tab.context?.savedScriptId === scriptId);
            if (existing) {
                const group = groups.find(candidate =>
                    candidate.tabs.some(tab => tab.id === existing.id),
                );
                if (group) {
                    setActiveGroupId(group.id);
                    setActiveTabId(existing.id, group.id);
                    if (lineNumber) {
                        setTimeout(
                            () =>
                                emitCommand(DOM_EVENT.JUMP_TO_LINE_ACTION, {
                                    tabId: existing.id,
                                    line: lineNumber,
                                }),
                            0,
                        );
                    }
                    onClose();
                    return;
                }
            }

            const tabId = addTab({
                type: TAB_TYPE.QUERY,
                name: scriptName,
                query: resolvedContent,
                context: {
                    savedScriptId: scriptId,
                    scriptProjectId: projectId,
                    scriptConnectionName: connectionName,
                },
            });
            if (lineNumber) {
                setTimeout(
                    () =>
                        emitCommand(DOM_EVENT.JUMP_TO_LINE_ACTION, {
                            tabId,
                            line: lineNumber,
                        }),
                    50,
                );
            }
            onClose();
        },
        [addTab, connectionName, groups, onClose, projectId, setActiveGroupId, setActiveTabId],
    );

    return (
        <ScriptSearchResults
            query={query}
            projectId={projectId}
            connectionName={connectionName}
            onOpen={handleOpenScript}
        />
    );
};

export const scriptMode: SearchModeDescriptor = {
    id: 'script',
    prefix: '#',
    description: 'Search saved script names and content',
    placeholder: 'Search script content...',
    dialogTitle: 'Search Scripts',
    Results: ScriptResults,
    InputAccessory: ScriptSearchSummaryBar,
};
