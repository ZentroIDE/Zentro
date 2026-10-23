// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { GitBranch, Plus } from 'lucide-react';

import { useGitBranchStore } from '../../../../stores/gitBranchStore';
import { useProjectStore } from '../../../../stores/projectStore';
import { CommandEmpty, CommandGroup, CommandItem } from '../../../ui';
import { useToast } from '../../Toast';
import type { SearchModeDescriptor, SearchModeResultsProps } from './types';

const GitBranchResults: React.FC<SearchModeResultsProps> = ({ query, onClose }) => {
    const { toast } = useToast();
    const activeProject = useProjectStore(state => state.activeProject);
    const hasGitRepo = Boolean(activeProject?.storage_path);

    const branch = useGitBranchStore(state => state.branch);
    const branches = useGitBranchStore(state => state.branches);
    const loading = useGitBranchStore(state => state.loading);
    const busy = useGitBranchStore(state => state.busy);
    const load = useGitBranchStore(state => state.load);
    const checkout = useGitBranchStore(state => state.checkout);
    const createBranch = useGitBranchStore(state => state.createBranch);
    const createBranchFrom = useGitBranchStore(state => state.createBranchFrom);
    const checkoutDetached = useGitBranchStore(state => state.checkoutDetached);

    React.useEffect(() => {
        void load(hasGitRepo);
    }, [hasGitRepo, load]);

    const queryValue = query.trim();
    const normalizedQuery = queryValue.toLowerCase();
    const filtered = React.useMemo(
        () => branches.filter(name => name.toLowerCase().includes(normalizedQuery)),
        [branches, normalizedQuery],
    );
    const firstCandidateBranch = filtered[0] || branch;

    const handleCheckout = React.useCallback(
        async (name: string) => {
            try {
                await checkout(name);
                onClose();
            } catch (error) {
                toast.error(`Switch branch failed: ${error}`);
            }
        },
        [checkout, onClose, toast],
    );

    const handleCreateBranch = React.useCallback(async () => {
        try {
            const outcome = await createBranch(queryValue);
            if (outcome === 'created') toast.success(`Created "${queryValue}"`);
            onClose();
        } catch (error) {
            toast.error(`Create branch failed: ${error}`);
        }
    }, [createBranch, onClose, queryValue, toast]);

    const handleCreateBranchFrom = React.useCallback(async () => {
        try {
            const outcome = await createBranchFrom(queryValue, firstCandidateBranch);
            if (outcome === 'created') {
                toast.success(`Created "${queryValue}" from "${firstCandidateBranch}"`);
            }
            onClose();
        } catch (error) {
            toast.error(`Create branch from failed: ${error}`);
        }
    }, [createBranchFrom, firstCandidateBranch, onClose, queryValue, toast]);

    const handleCheckoutDetached = React.useCallback(async () => {
        const target = queryValue || firstCandidateBranch;
        try {
            await checkoutDetached(target);
            toast.success(`Checked out detached at "${target}"`);
            onClose();
        } catch (error) {
            toast.error(`Checkout detached failed: ${error}`);
        }
    }, [checkoutDetached, firstCandidateBranch, onClose, queryValue, toast]);

    if (!hasGitRepo) {
        return <CommandEmpty>No git repository in this project.</CommandEmpty>;
    }

    if (loading) {
        return <CommandEmpty>Loading branches...</CommandEmpty>;
    }

    return (
        <>
            <CommandEmpty>No branch matches your search.</CommandEmpty>
            <CommandGroup>
                <CommandItem
                    value='action:create'
                    disabled={busy || queryValue.length === 0}
                    onSelect={() => void handleCreateBranch()}
                >
                    <Plus size={12} className='shrink-0 text-muted-foreground' />
                    <span className='truncate'>Create new branch...</span>
                </CommandItem>
                <CommandItem
                    value='action:create-from'
                    disabled={busy || queryValue.length === 0 || !firstCandidateBranch}
                    onSelect={() => void handleCreateBranchFrom()}
                >
                    <Plus size={12} className='shrink-0 text-muted-foreground' />
                    <span className='truncate'>
                        Create new branch from...
                        {firstCandidateBranch ? ` (${firstCandidateBranch})` : ''}
                    </span>
                </CommandItem>
                <CommandItem
                    value='action:detached'
                    disabled={busy || (queryValue.length === 0 && !firstCandidateBranch)}
                    onSelect={() => void handleCheckoutDetached()}
                >
                    <GitBranch size={12} className='shrink-0 text-muted-foreground' />
                    <span className='truncate'>Checkout detached...</span>
                </CommandItem>
            </CommandGroup>
            {filtered.length > 0 ? (
                <CommandGroup heading={`Branches (${filtered.length})`}>
                    {filtered.map(name => (
                        <CommandItem
                            key={name}
                            value={`branch:${name}`}
                            disabled={busy}
                            onSelect={() => void handleCheckout(name)}
                        >
                            <GitBranch size={12} className='shrink-0 text-muted-foreground' />
                            <span className='truncate'>{name}</span>
                            {name === branch ? (
                                <span className='ml-auto text-label font-semibold text-[--interactive-primary]'>
                                    current
                                </span>
                            ) : null}
                        </CommandItem>
                    ))}
                </CommandGroup>
            ) : null}
        </>
    );
};

export const gitMode: SearchModeDescriptor = {
    id: 'git',
    prefix: '@git',
    description: 'Switch, create, or check out git branches',
    placeholder: 'Select a branch to checkout, or type a new branch name',
    dialogTitle: 'Git Branches',
    Results: GitBranchResults,
};
