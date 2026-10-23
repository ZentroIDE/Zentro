// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { getProvider } from '../../../lib/providers';
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

interface ToolExportSheetProps {
    open: boolean;
    connections: ConnectionProfile[];
    exporting: boolean;
    // Called with the selected connection names (never empty).
    onConfirm: (names: string[]) => void | Promise<void>;
    onClose: () => void;
}

/**
 * Connection-export checklist. Mirrors ToolImportSheet: select-all + per-row
 * checkboxes, all pre-checked. Confirm writes a Zentro bundle JSON (secrets
 * always stripped by the backend).
 */
export const ToolExportSheet: React.FC<ToolExportSheetProps> = ({
    open,
    connections,
    exporting,
    onConfirm,
    onClose,
}) => {
    const [selected, setSelected] = React.useState<Set<string>>(new Set());

    React.useEffect(() => {
        if (open) {
            setSelected(new Set(connections.map(c => c.name).filter(Boolean)));
        }
    }, [open, connections]);

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
        const names = connections.map(c => c.name).filter(name => name && selected.has(name));
        if (names.length === 0) return;
        await onConfirm(names);
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
                    <DialogTitle>Export connections</DialogTitle>
                    <p className='text-small text-muted-foreground mt-1'>
                        Select connections to export. Passwords are never included.
                    </p>
                </DialogHeader>

                <div className='flex-1 overflow-y-auto px-5 pb-2' style={{ maxHeight: '360px' }}>
                    {connections.length === 0 ? (
                        <div className='py-8 text-center text-small text-muted-foreground'>
                            No connections to export.
                        </div>
                    ) : (
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

                <DialogFooter className='px-5 py-4 border-t border-border/50'>
                    <Button type='button' variant='ghost' onClick={onClose} disabled={exporting}>
                        Cancel
                    </Button>
                    <Button
                        type='button'
                        variant='default'
                        onClick={() => void handleConfirm()}
                        disabled={selected.size === 0 || exporting}
                    >
                        Export {selected.size > 0 ? `(${selected.size})` : ''}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
