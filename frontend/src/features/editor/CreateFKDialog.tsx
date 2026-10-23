// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
    Button,
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '../../components/ui';
import { type FKRule } from './TableInfo/fkUtils';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { FKFormBody } from './FKFormBody';

interface CreateFKDialogProps {
    open: boolean;
    sourceTable: string;
    sourceColumn: string;
    sourceType: string;
    targetTable: string;
    targetColumn: string;
    targetType: string;
    schema: string;
    connectionID: string;
    dbName: string;
    onClose: () => void;
    onCreated: () => void;
}

export const CreateFKDialog: React.FC<CreateFKDialogProps> = ({
    open,
    sourceTable,
    sourceColumn,
    sourceType,
    targetTable,
    targetColumn,
    targetType,
    schema,
    connectionID,
    dbName,
    onClose,
    onCreated,
}) => {
    const [name, setName] = useState(`fk_${sourceTable}_${sourceColumn}`);
    const [onDelete, setOnDelete] = useState<FKRule>('NO ACTION');
    const [onUpdate, setOnUpdate] = useState<FKRule>('NO ACTION');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const handleCreate = async () => {
        if (!name.trim()) return;
        setSaving(true);
        setError('');
        try {
            unwrapOrThrow(
                await getApiGateway().schema.createForeignKey(
                    connectionID,
                    dbName,
                    schema,
                    sourceTable,
                    {
                        Name: name.trim(),
                        Columns: [sourceColumn],
                        RefSchema: schema,
                        RefTable: targetTable,
                        RefColumns: [targetColumn],
                        OnDelete: onDelete,
                        OnUpdate: onUpdate,
                    },
                ),
            );
            onCreated();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={v => !v && !saving && onClose()}>
            <DialogContent size='sm'>
                <DialogHeader>
                    <DialogTitle>Create Foreign Key</DialogTitle>
                </DialogHeader>

                <div className='px-4 py-3'>
                    <FKFormBody
                        name={name}
                        onNameChange={setName}
                        sourceTable={sourceTable}
                        sourceColumn={sourceColumn}
                        sourceType={sourceType}
                        targetTable={targetTable}
                        targetColumn={targetColumn}
                        targetType={targetType}
                        onDelete={onDelete}
                        onDeleteChange={setOnDelete}
                        onUpdate={onUpdate}
                        onUpdateChange={setOnUpdate}
                        disabled={saving}
                        error={error}
                        selectContentClass='z-topmost'
                    />
                </div>

                <DialogFooter className='px-4 pb-4'>
                    <Button variant='ghost' onClick={onClose} disabled={saving}>
                        Cancel
                    </Button>
                    <Button
                        variant={'default'}
                        onClick={() => void handleCreate()}
                        disabled={saving || !name.trim()}
                    >
                        {saving && <Loader2 size={13} className='mr-1.5 animate-spin' />}
                        Create FK
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
