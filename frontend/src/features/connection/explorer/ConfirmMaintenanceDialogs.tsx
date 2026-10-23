// SPDX-License-Identifier: GPL-3.0-only

import type { DroppableObjectType } from '../../../lib/constants';
import React from 'react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '../../../components/ui';
import { RelationshipWarning } from '../../../components/shared/RelationshipWarning';
import type { DeleteRelationshipsState } from '../../../hooks/useDeleteRelationships';

export interface DropModalState {
    schema: string;
    item: string;
    type: DroppableObjectType;
    cascade: boolean;
}

export interface TruncateModalState {
    schema: string;
    tableName: string;
    cascade: boolean;
    restartIdentity: boolean;
}

interface ConfirmMaintenanceDialogsProps {
    dropModal: DropModalState | null;
    truncateModal: TruncateModalState | null;
    onCloseDrop: () => void;
    onCloseTruncate: () => void;
    onConfirmDrop: () => void;
    onConfirmTruncate: () => void;
    /** Other tables' foreign keys into the table being dropped; shown as a warning. */
    dropRelationships?: DeleteRelationshipsState;
    truncateRelationships?: DeleteRelationshipsState;
}

// Confirmation dialogs for the destructive explorer actions (drop/truncate).
export const ConfirmMaintenanceDialogs: React.FC<ConfirmMaintenanceDialogsProps> = ({
    dropModal,
    truncateModal,
    onCloseDrop,
    onCloseTruncate,
    onConfirmDrop,
    onConfirmTruncate,
    dropRelationships,
    truncateRelationships,
}) => (
    <>
        <Dialog open={Boolean(dropModal)} onOpenChange={v => !v && onCloseDrop()}>
            <DialogContent size='sm'>
                <DialogHeader>
                    <DialogTitle>Drop {dropModal?.type || 'Object'}</DialogTitle>
                </DialogHeader>
                <div className='px-4 py-3'>
                    <p className='text-small'>Are you sure you want to drop "{dropModal?.item}"?</p>
                    <p className='text-label text-muted-foreground mt-1'>
                        {dropModal?.cascade
                            ? 'This action cannot be undone and will include CASCADE.'
                            : 'This action cannot be undone.'}
                    </p>
                    {dropRelationships ? (
                        <div className='mt-2'>
                            <RelationshipWarning
                                state={dropRelationships}
                                context='drop'
                                cascade={dropModal?.cascade}
                            />
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant='ghost' onClick={onCloseDrop}>
                        Cancel
                    </Button>
                    <Button variant='destructive' onClick={onConfirmDrop}>
                        Drop
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
        <Dialog open={Boolean(truncateModal)} onOpenChange={v => !v && onCloseTruncate()}>
            <DialogContent size='sm'>
                <DialogHeader>
                    <DialogTitle>Truncate Table</DialogTitle>
                </DialogHeader>
                <div className='px-4 py-3'>
                    <p className='text-small'>
                        Are you sure you want to truncate "{truncateModal?.tableName}"?
                    </p>
                    <p className='text-label text-muted-foreground mt-1'>
                        {truncateModal?.cascade
                            ? 'This will remove all rows (CASCADE) and cannot be undone.'
                            : truncateModal?.restartIdentity
                              ? 'This will remove all rows and restart identity values.'
                              : 'This will remove all rows and cannot be undone.'}
                    </p>
                    {truncateRelationships ? (
                        <div className='mt-2'>
                            <RelationshipWarning
                                state={truncateRelationships}
                                context='truncate'
                                cascade={truncateModal?.cascade}
                            />
                        </div>
                    ) : null}
                </div>
                <DialogFooter>
                    <Button variant='ghost' onClick={onCloseTruncate}>
                        Cancel
                    </Button>
                    <Button variant='destructive' onClick={onConfirmTruncate}>
                        Truncate
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    </>
);
