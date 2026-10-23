// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Button } from '../../components/ui';
import { cn } from '../../lib/cn';

interface UnsavedChangesBannerProps {
    open: boolean;
    saving: boolean;
    saveLabel: string;
    discardLabel: string;
    onSave: () => void;
    onDiscard: () => void;
    onKeepEditing: () => void;
}

export const UnsavedChangesBanner: React.FC<UnsavedChangesBannerProps> = ({
    open,
    saving,
    saveLabel,
    discardLabel,
    onSave,
    onDiscard,
    onKeepEditing,
}) => {
    const [mounted, setMounted] = React.useState(open);
    const [expanded, setExpanded] = React.useState(open);

    React.useEffect(() => {
        if (open) {
            setMounted(true);
            const raf = window.requestAnimationFrame(() => setExpanded(true));
            return () => window.cancelAnimationFrame(raf);
        }

        setExpanded(false);
        const timeout = window.setTimeout(() => setMounted(false), 180);
        return () => window.clearTimeout(timeout);
    }, [open]);

    if (!mounted) return null;

    return (
        <div
            className={cn(
                'shrink-0 overflow-hidden rounded-md bg-(--state-warning-bg) px-3',
                'transition-all duration-180 ease-out',
                expanded ? 'max-h-16 py-2 opacity-100' : 'max-h-0 py-0 opacity-0',
            )}
        >
            <div className='flex flex-wrap items-center gap-2'>
                <div className='min-w-0 flex-1'>
                    <span className='text-small font-medium text-foreground'>
                        Save your changes?
                    </span>
                </div>

                <div className='ml-auto flex flex-wrap items-center gap-2'>
                    <Button variant='ghost' onClick={onKeepEditing} disabled={saving}>
                        Keep editing
                    </Button>
                    <Button variant='destructive' onClick={onDiscard} disabled={saving}>
                        {discardLabel}
                    </Button>
                    <Button variant='default' onClick={onSave} disabled={saving}>
                        {saving ? 'Saving...' : saveLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
};
