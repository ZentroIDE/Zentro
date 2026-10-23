// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Button } from '../../../components/ui';

interface WritePreviewBannerProps {
    writePreviewActionLoading: 'confirm' | 'cancel' | null;
    onCancel: () => void;
    onConfirm: () => void;
}

export const WritePreviewBanner: React.FC<WritePreviewBannerProps> = ({
    writePreviewActionLoading,
    onCancel,
    onConfirm,
}) => (
    <div className='flex items-center justify-between gap-3 border-b border-accent/20 bg-accent/8 px-3 py-2'>
        <div className='min-w-0'>
            <p className='text-small font-medium text-foreground'>Sandbox write preview</p>
            <p className='text-label text-muted-foreground'>
                Previewed rows are generated in a temporary sandbox transaction and have not been
                committed.
            </p>
        </div>
        <div className='flex items-center gap-2 shrink-0'>
            <Button
                variant='ghost'
                size='sm'
                onClick={onCancel}
                disabled={writePreviewActionLoading !== null}
            >
                {writePreviewActionLoading === 'cancel' ? 'Closing...' : 'Cancel Preview'}
            </Button>
            <Button
                variant='destructive'
                size='sm'
                onClick={onConfirm}
                disabled={writePreviewActionLoading !== null}
            >
                {writePreviewActionLoading === 'confirm' ? 'Running...' : 'Confirm Run'}
            </Button>
        </div>
    </div>
);
