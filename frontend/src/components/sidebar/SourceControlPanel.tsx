// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { FileCode2, GitBranch, History, RefreshCw } from 'lucide-react';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import type {
    SCFileStatus,
    SCCommit as SCCommitType,
    GitCommitFileDiff,
} from '../../platform/app-api/types';
import { useProjectStore } from '../../stores/projectStore';
import { useEditorStore } from '../../stores/editorStore';
import { useScriptStore } from '../../stores/scriptStore';
import { useConnectionStore } from '../../stores/connectionStore';
import { useToast } from '../layout/Toast';
import { cn } from '../../lib/cn';
import { EmptyPanelState } from '../shared/EmptyPanelState';
import { IconTabBar } from '../shared/IconTabBar';
import { Button, Input } from '../ui';
import { onCommand } from '../../lib/commandBus';
import { DOM_EVENT } from '../../lib/constants';
import { SourceControlChangesView } from './sourceControl/SourceControlChangesView';
import { SourceControlHistoryView } from './sourceControl/SourceControlHistoryView';
import { useSourceControlFileActions } from './sourceControl/useSourceControlFileActions';

type Tab = 'changes' | 'history';

export const SourceControlPanel: React.FC = () => {
    const activeProject = useProjectStore(state => state.activeProject);
    const addTab = useEditorStore(state => state.addTab);
    const scripts = useScriptStore(state => state.scripts);
    const activeProfile = useConnectionStore(state => state.activeProfile);
    const { toast } = useToast();

    const [activeTab, setActiveTab] = React.useState<Tab>('changes');
    const [loading, setLoading] = React.useState(false);
    const [staged, setStaged] = React.useState<SCFileStatus[]>([]);
    const [unstaged, setUnstaged] = React.useState<SCFileStatus[]>([]);

    const [history, setHistory] = React.useState<SCCommitType[]>([]);
    const [historyLoading, setHistoryLoading] = React.useState(false);
    const [expandedHash, setExpandedHash] = React.useState<string | null>(null);
    const [fileDiffsCache, setFileDiffsCache] = React.useState<Record<string, GitCommitFileDiff[]>>(
        {},
    );
    const [fileDiffsLoading, setFileDiffsLoading] = React.useState<string | null>(null);
    const [selectedFileKey, setSelectedFileKey] = React.useState<string | null>(null);

    const [commitMessage, setCommitMessage] = React.useState('');
    const [isCommitting, setIsCommitting] = React.useState(false);
    const [workingDiffLoadingKey, setWorkingDiffLoadingKey] = React.useState<string | null>(null);

    const [repoNotInitialized, setRepoNotInitialized] = React.useState(false);
    const [initLoading, setInitLoading] = React.useState(false);
    const [gitIgnoreLoading, setGitIgnoreLoading] = React.useState(false);

    const repoPath = (activeProject?.storage_path || '').trim();
    const hasRepoPath = Boolean(repoPath);
    const scriptNameById = React.useMemo(() => {
        const map = new Map<string, string>();
        (scripts || []).forEach(script => {
            const id = String(script.id || '').trim();
            const name = String(script.name || '').trim();
            if (id && name) {
                map.set(id, name);
            }
        });
        return map;
    }, [scripts]);

    const getDisplayFileName = React.useCallback(
        (path: string) => {
            const normalized = String(path || '').replace(/\\/g, '/');
            const rawFile = normalized.split('/').pop() || normalized;
            const lower = rawFile.toLowerCase();
            if (!lower.endsWith('.sql')) {
                return rawFile;
            }

            const stem = rawFile.slice(0, -4);
            const scriptName = scriptNameById.get(stem);
            if (!scriptName) {
                return rawFile;
            }
            return scriptName.toLowerCase().endsWith('.sql') ? scriptName : `${scriptName}.sql`;
        },
        [scriptNameById],
    );

    const loadStatus = React.useCallback(async () => {
        if (!repoPath) return;
        setLoading(true);
        setRepoNotInitialized(false);
        try {
            const status = unwrapOrThrow(await getApiGateway().sourceControl.getStatus());
            const files = Array.isArray(status.files) ? status.files : [];
            setStaged(files.filter(f => f.staged));
            setUnstaged(files.filter(f => !f.staged));
        } catch (error) {
            const errorMsg = String(error);
            if (
                errorMsg.includes('cannot open repo') ||
                errorMsg.includes('not a git repository')
            ) {
                setRepoNotInitialized(true);
            } else {
                toast.error(`Source control: ${error}`);
            }
        } finally {
            setLoading(false);
        }
    }, [repoPath, toast]);

    const loadHistory = React.useCallback(async () => {
        if (!repoPath) return;
        setHistoryLoading(true);
        try {
            const commits = unwrapOrThrow(await getApiGateway().sourceControl.getHistory(100));
            setHistory(commits || []);
        } catch (error) {
            toast.error(`Source control history: ${error}`);
        } finally {
            setHistoryLoading(false);
        }
    }, [repoPath, toast]);

    React.useEffect(() => {
        void loadStatus();
    }, [loadStatus]);

    React.useEffect(() => {
        if (activeTab === 'history') {
            void loadHistory();
        }
    }, [activeTab, loadHistory]);

    // A contributed history section (Pro's schema rollback) changed the repo;
    // this panel owns the commit list and status, so it reloads them.
    React.useEffect(() => {
        return onCommand(DOM_EVENT.REFRESH_SOURCE_CONTROL, () => {
            void loadStatus();
            if (activeTab === 'history') void loadHistory();
        });
    }, [activeTab, loadHistory, loadStatus]);

    const handleStage = React.useCallback(
        async (path: string) => {
            try {
                unwrapOrThrow(await getApiGateway().sourceControl.stageFile(path));
                await loadStatus();
            } catch (error) {
                toast.error(`Stage failed: ${error}`);
            }
        },
        [loadStatus, toast],
    );

    const handleUnstage = React.useCallback(
        async (path: string) => {
            try {
                unwrapOrThrow(await getApiGateway().sourceControl.unstageFile(path));
                await loadStatus();
            } catch (error) {
                toast.error(`Unstage failed: ${error}`);
            }
        },
        [loadStatus, toast],
    );

    const handleStageAll = React.useCallback(async () => {
        try {
            unwrapOrThrow(await getApiGateway().sourceControl.stageAll());
            await loadStatus();
        } catch (error) {
            toast.error(`Stage all failed: ${error}`);
        }
    }, [loadStatus, toast]);

    const handleCommit = React.useCallback(async () => {
        if (staged.length === 0 || isCommitting) return;
        setIsCommitting(true);
        try {
            const hash = unwrapOrThrow(await getApiGateway().sourceControl.commit(commitMessage));
            toast.success(`Committed (${hash.slice(0, 8)})`);
            setCommitMessage('');
            await loadStatus();
            if (activeTab === 'history') await loadHistory();
        } catch (error) {
            toast.error(`Commit failed: ${error}`);
        } finally {
            setIsCommitting(false);
        }
    }, [activeTab, commitMessage, isCommitting, loadHistory, loadStatus, staged.length, toast]);

    const handleInitRepo = React.useCallback(async () => {
        try {
            setInitLoading(true);
            unwrapOrThrow(await getApiGateway().sourceControl.initRepo());
            toast.success('Repository initialized');
            setRepoNotInitialized(false);
            await loadStatus();
        } catch (error) {
            toast.error(`Init failed: ${error}`);
        } finally {
            setInitLoading(false);
        }
    }, [loadStatus, toast]);

    const handleToggleCommit = React.useCallback(
        async (hash: string) => {
            if (expandedHash === hash) {
                setExpandedHash(null);
                return;
            }
            setExpandedHash(hash);
            if (!fileDiffsCache[hash]) {
                setFileDiffsLoading(hash);
                try {
                    const diffs = unwrapOrThrow(
                        await getApiGateway().sourceControl.getFileDiffs(hash),
                    );
                    setFileDiffsCache(prev => ({ ...prev, [hash]: diffs }));
                } catch (error) {
                    toast.error(`Load diffs failed: ${error}`);
                } finally {
                    setFileDiffsLoading(null);
                }
            }
        },
        [expandedHash, fileDiffsCache, toast],
    );

    const {
        handleOpenGitIgnoreEditor,
        handleOpenDiff,
        handleOpenHistoryFileQuery,
        handleOpenWorkingDiff,
        handleOpenFileQuery,
    } = useSourceControlFileActions({
        addTab,
        toast,
        getDisplayFileName,
        scriptNameById,
        activeProjectId: activeProject?.id,
        activeProfileName: activeProfile?.name,
        setSelectedFileKey,
        setWorkingDiffLoadingKey,
        setGitIgnoreLoading,
    });

    if (!activeProject?.id) {
        return (
            <EmptyPanelState
                icon={<GitBranch size={24} />}
                title='Source Control'
                description='Open a project to use Source Control.'
            />
        );
    }

    if (!hasRepoPath) {
        return (
            <EmptyPanelState
                icon={<GitBranch size={24} />}
                title='No source control repository configured'
                description='Set a project storage folder in Project Settings to enable Source Control.'
            />
        );
    }

    if (repoNotInitialized) {
        return (
            <EmptyPanelState
                icon={<GitBranch size={24} />}
                title='Initialize Repository'
                description='The folder at this path is not yet a git repository.'
                action={
                    <Button
                        variant='default'
                        size='sm'
                        onClick={() => void handleInitRepo()}
                        disabled={initLoading}
                    >
                        {initLoading ? 'Initializing...' : 'Initialize'}
                    </Button>
                }
            />
        );
    }

    return (
        <div className='flex flex-col h-full overflow-hidden'>
            <div className='px-2.5 py-1.5 border-b border-border flex items-center gap-1.5'>
                <IconTabBar
                    value={activeTab}
                    onChange={setActiveTab}
                    items={[
                        {
                            value: 'changes',
                            icon: <GitBranch size={13} />,
                            title: `Changes (${staged.length + unstaged.length})`,
                        },
                        { value: 'history', icon: <History size={13} />, title: 'History' },
                    ]}
                    trailingActions={
                        <>
                            <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='h-7 w-7 text-muted-foreground ui-interactive-surface'
                                onClick={() => {
                                    void handleOpenGitIgnoreEditor();
                                }}
                                title='Edit .gitignore'
                                disabled={gitIgnoreLoading}
                            >
                                <FileCode2
                                    size={13}
                                    className={cn(gitIgnoreLoading && 'animate-pulse')}
                                />
                            </Button>
                            <Button
                                type='button'
                                variant='ghost'
                                size='icon'
                                className='h-7 w-7 text-muted-foreground ui-interactive-surface'
                                onClick={() => {
                                    void loadStatus();
                                }}
                                title='Refresh'
                            >
                                <RefreshCw size={13} className={cn(loading && 'animate-spin')} />
                            </Button>
                        </>
                    }
                    className='w-full'
                />
            </div>

            <div className='flex-1 min-h-0 overflow-y-auto'>
                {activeTab === 'changes' && (
                    <SourceControlChangesView
                        loading={loading}
                        staged={staged}
                        unstaged={unstaged}
                        selectedFileKey={selectedFileKey}
                        onStage={path => {
                            void handleStage(path);
                        }}
                        onUnstage={path => {
                            void handleUnstage(path);
                        }}
                        onStageAll={() => {
                            void handleStageAll();
                        }}
                        onOpenWorkingDiff={(f, stagedView) => {
                            void handleOpenWorkingDiff(f, stagedView);
                        }}
                        onOpenFileQuery={(f, stagedView) => {
                            void handleOpenFileQuery(f, stagedView);
                        }}
                        getDisplayFileName={getDisplayFileName}
                    />
                )}

                {activeTab === 'history' && (
                    <SourceControlHistoryView
                        historyLoading={historyLoading}
                        history={history}
                        expandedHash={expandedHash}
                        fileDiffsCache={fileDiffsCache}
                        fileDiffsLoading={fileDiffsLoading}
                        selectedFileKey={selectedFileKey}
                        onToggleCommit={hash => {
                            void handleToggleCommit(hash);
                        }}
                        onOpenDiff={handleOpenDiff}
                        onOpenHistoryFileQuery={handleOpenHistoryFileQuery}
                        getDisplayFileName={getDisplayFileName}
                    />
                )}
            </div>

            {activeTab === 'changes' && (
                <div className='border-t border-border px-2.5 py-2'>
                    <div className='mb-1 text-label text-muted-foreground'>
                        {workingDiffLoadingKey
                            ? 'Loading diff preview...'
                            : staged.length === 0
                              ? 'No staged files to commit.'
                              : `Ready to commit ${staged.length} staged file(s).`}
                    </div>
                    <div className='flex items-center gap-2'>
                        <Input
                            value={commitMessage}
                            className='text-label'
                            placeholder='Commit message (optional)'
                            onChange={e => setCommitMessage(e.target.value)}
                            onKeyDown={e => {
                                if (e.key === 'Enter') {
                                    e.preventDefault();
                                    void handleCommit();
                                }
                            }}
                        />
                        <Button
                            variant='default'
                            size='sm'
                            onClick={() => void handleCommit()}
                            disabled={staged.length === 0 || isCommitting}
                            title='Commit staged changes'
                        >
                            {isCommitting ? 'Committing...' : 'Commit'}
                        </Button>
                    </div>
                </div>
            )}
        </div>
    );
};
