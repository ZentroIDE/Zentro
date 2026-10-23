// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ArrowLeft, FolderInput } from 'lucide-react';
import { getProvider } from '../../../lib/providers';
import type { app } from '../../../../wailsjs/go/models';
import type { ConnectionProfile } from '../../../types/connection';
import {
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../ui';

interface ToolImportSheetProps {
    open: boolean;
    // All registered importers — used to render the tool-picker step.
    importers: app.ImporterInfo[];
    // Non-null once the user has picked a tool (or when only one importer exists).
    selectedImporterKey: string | null;
    // Connections returned by the backend after running the chosen importer.
    connections: ConnectionProfile[];
    // Called when the user picks a tool in the picker step.
    onSelectImporter: (key: string) => void | Promise<void>;
    // Called when the user confirms the selected connections.
    onConfirm: (selected: ConnectionProfile[]) => void | Promise<void>;
    onClose: () => void;
}

export const ToolImportSheet: React.FC<ToolImportSheetProps> = ({
    open,
    importers,
    selectedImporterKey,
    connections,
    onSelectImporter,
    onConfirm,
    onClose,
}) => {
    const [selected, setSelected] = React.useState<Set<string>>(new Set());
    const [busy, setBusy] = React.useState(false);

    // When connections change (tool was selected), pre-check all of them.
    React.useEffect(() => {
        setSelected(new Set(connections.map(c => c.name).filter(Boolean)));
    }, [connections]);

    // Whether we're in the tool-picker step.
    const showToolPicker = selectedImporterKey === null && importers.length > 1;

    const selectedImporter = importers.find(i => i.key === selectedImporterKey) ?? null;

    const toggleAll = () => {
        setSelected(prev =>
            prev.size === connections.length
                ? new Set()
                : new Set(connections.map(c => c.name).filter(Boolean)),
        );
    };

    const toggleOne = (name: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            next.has(name) ? next.delete(name) : next.add(name);
            return next;
        });
    };

    const handleConfirm = async () => {
        const chosen = connections.filter(c => c.name && selected.has(c.name));
        if (chosen.length === 0) return;
        setBusy(true);
        try {
            await onConfirm(chosen);
        } finally {
            setBusy(false);
        }
    };

    const handleSelectTool = async (key: string) => {
        setBusy(true);
        try {
            await onSelectImporter(key);
        } finally {
            setBusy(false);
        }
    };

    const allChecked = connections.length > 0 && selected.size === connections.length;
    const someChecked = selected.size > 0 && !allChecked;

    return (
        <Dialog
            open={open}
            onOpenChange={o => {
                if (!o) onClose();
            }}
        >
            <DialogContent size='sm' className='flex flex-col gap-0 p-0'>
                <DialogHeader className='px-5 pt-5 pb-3'>
                    <DialogTitle className='flex items-center gap-2'>
                        {showToolPicker ? (
                            'Import from tool'
                        ) : (
                            <>
                                {importers.length > 1 && (
                                    <Button
                                        type='button'
                                        variant='ghost'
                                        size='icon'
                                        className='h-6 w-6 shrink-0'
                                        onClick={() => onSelectImporter('')}
                                        title='Back to tool selection'
                                    >
                                        <ArrowLeft size={13} />
                                    </Button>
                                )}
                                {selectedImporter
                                    ? `Import from ${selectedImporter.name}`
                                    : 'Import connections'}
                            </>
                        )}
                    </DialogTitle>
                    <p className='text-small text-muted-foreground mt-1'>
                        {showToolPicker
                            ? 'Choose where to import connections from.'
                            : 'Select connections to import. Passwords are not imported.'}
                    </p>
                </DialogHeader>

                <div className='flex-1 overflow-y-auto px-5 pb-2' style={{ maxHeight: '360px' }}>
                    {showToolPicker ? (
                        // ── Step 1: tool picker ──────────────────────────────────
                        <div className='flex flex-col gap-1 py-1'>
                            {importers.map(imp => (
                                <Button
                                    key={imp.key}
                                    type='button'
                                    variant='ghost'
                                    disabled={busy}
                                    onClick={() => void handleSelectTool(imp.key)}
                                    className='flex h-auto items-center justify-start gap-3 rounded-md px-3 py-3 text-left'
                                >
                                    <FolderInput
                                        size={18}
                                        className='shrink-0 text-muted-foreground'
                                    />
                                    <div>
                                        <div className='text-small font-medium'>{imp.name}</div>
                                        <div className='text-label text-muted-foreground'>
                                            Import saved connections
                                        </div>
                                    </div>
                                </Button>
                            ))}
                        </div>
                    ) : connections.length === 0 ? (
                        // ── No connections found ─────────────────────────────────
                        <div className='py-8 text-center text-small text-muted-foreground'>
                            No supported connections found.
                        </div>
                    ) : (
                        // ── Step 2: connection picker ────────────────────────────
                        <>
                            <div
                                className='flex items-center gap-2.5 py-2 cursor-pointer ui-interactive-surface rounded-md px-1 mb-1'
                                onClick={toggleAll}
                            >
                                <Checkbox
                                    checked={
                                        allChecked ? true : someChecked ? 'indeterminate' : false
                                    }
                                    onCheckedChange={toggleAll}
                                    onClick={e => e.stopPropagation()}
                                />
                                <span className='text-small font-medium text-muted-foreground'>
                                    Select all ({connections.length})
                                </span>
                            </div>
                            <div className='border-t border-border/50 mb-1' />
                            {connections.map(profile => {
                                const provider = getProvider(profile.driver || '');
                                const host = profile.host
                                    ? `${profile.host}${profile.port ? `:${profile.port}` : ''}`
                                    : '';
                                const isChecked = !!profile.name && selected.has(profile.name);
                                return (
                                    <div
                                        key={profile.name}
                                        className='flex items-center gap-2.5 py-2 px-1 rounded-md cursor-pointer ui-interactive-surface'
                                        onClick={() => profile.name && toggleOne(profile.name)}
                                    >
                                        <Checkbox
                                            checked={isChecked}
                                            onCheckedChange={() =>
                                                profile.name && toggleOne(profile.name)
                                            }
                                            onClick={e => e.stopPropagation()}
                                        />
                                        <img
                                            src={provider.icon}
                                            alt={provider.label}
                                            className='h-4 w-4 shrink-0 object-contain'
                                        />
                                        <div className='min-w-0 flex-1'>
                                            <div className='truncate text-small font-medium'>
                                                {profile.name}
                                            </div>
                                            {host && (
                                                <div className='truncate text-label text-muted-foreground'>
                                                    {host}
                                                    {profile.db_name ? ` / ${profile.db_name}` : ''}
                                                </div>
                                            )}
                                        </div>
                                        <span className='shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-label text-muted-foreground'>
                                            {provider.label}
                                        </span>
                                    </div>
                                );
                            })}
                        </>
                    )}
                </div>

                {!showToolPicker && (
                    <DialogFooter className='px-5 py-4 border-t border-border/50'>
                        <Button type='button' variant='ghost' onClick={onClose} disabled={busy}>
                            Cancel
                        </Button>
                        <Button
                            type='button'
                            variant='default'
                            onClick={() => void handleConfirm()}
                            disabled={selected.size === 0 || busy}
                        >
                            Import {selected.size > 0 ? `(${selected.size})` : ''}
                        </Button>
                    </DialogFooter>
                )}
            </DialogContent>
        </Dialog>
    );
};
