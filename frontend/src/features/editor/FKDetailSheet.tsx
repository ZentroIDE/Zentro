// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { normalizeFKRule, type FKRule } from './TableInfo/fkUtils';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import { FKFormBody } from './FKFormBody';
import { Button } from '../../components/ui';

interface FKConstraintGroup {
    ConstraintName: string;
    SourceTable: string;
    TargetTable: string;
    columns: string[];
    targets: string[];
    OnDelete?: string;
    OnUpdate?: string;
}

interface FKDetailSheetProps {
    constraint: FKConstraintGroup | null;
    schema: string;
    connectionID: string;
    dbName: string;
    onClose: () => void;
    onUpdated: () => void;
}

export const FKDetailSheet: React.FC<FKDetailSheetProps> = ({
    constraint,
    schema,
    connectionID,
    dbName,
    onClose,
    onUpdated,
}) => {
    const [onDelete, setOnDelete] = useState<FKRule>('NO ACTION');
    const [onUpdate, setOnUpdate] = useState<FKRule>('NO ACTION');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (constraint) {
            setOnDelete(normalizeFKRule(constraint.OnDelete));
            setOnUpdate(normalizeFKRule(constraint.OnUpdate));
            setError('');
        }
    }, [constraint]);

    if (!constraint) return null;

    const originalOnDelete = normalizeFKRule(constraint.OnDelete);
    const originalOnUpdate = normalizeFKRule(constraint.OnUpdate);
    const isDirty = onDelete !== originalOnDelete || onUpdate !== originalOnUpdate;

    const handleSave = async () => {
        setSaving(true);
        setError('');
        try {
            unwrapOrThrow(
                await getApiGateway().schema.updateForeignKey(
                    connectionID,
                    dbName,
                    schema,
                    constraint.SourceTable,
                    constraint.ConstraintName,
                    {
                        Name: constraint.ConstraintName,
                        Columns: constraint.columns,
                        RefSchema: schema,
                        RefTable: constraint.TargetTable,
                        RefColumns: constraint.targets,
                        OnDelete: onDelete,
                        OnUpdate: onUpdate,
                    },
                ),
            );
            onUpdated();
            onClose();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className='absolute bottom-4 right-4 z-10 min-w-72 flex flex-col bg-card rounded-md shadow-elevation-sm animate-in slide-in-from-bottom-2 fade-in-0 duration-150 gap-1.5'>
            {/* Header */}
            <div className='flex items-start justify-between px-4 pt-3'>
                <div className='flex flex-col min-w-0 gap-1.5'>
                    <span className='text-label font-medium text-muted-foreground'>
                        Foreign Key
                    </span>
                    <span className=' text-label font-semibold text-foreground pl-3'>
                        {constraint.ConstraintName}
                    </span>
                </div>
                <Button
                    type='button'
                    variant='ghost'
                    size='icon'
                    onClick={onClose}
                    className='mt-0.5 p-1 rounded-md text-muted-foreground transition-colors shrink-0 ui-interactive-surface'
                >
                    <X size={13} />
                </Button>
            </div>

            {/* Body */}
            <div className='px-4 pb-4'>
                <FKFormBody
                    sourceTable={constraint.SourceTable}
                    sourceColumn={constraint.columns.join(', ')}
                    targetTable={constraint.TargetTable}
                    targetColumn={constraint.targets.join(', ')}
                    onDelete={onDelete}
                    onDeleteChange={setOnDelete}
                    onUpdate={onUpdate}
                    onUpdateChange={setOnUpdate}
                    disabled={saving}
                    error={error}
                    selectContentClass='z-topmost'
                />
            </div>

            {/* Footer */}
            {isDirty && (
                <div className='flex justify-end px-4 pb-3 gap-2'>
                    <Button
                        variant='ghost'
                        onClick={() => {
                            setOnDelete(originalOnDelete);
                            setOnUpdate(originalOnUpdate);
                        }}
                        disabled={saving}
                    >
                        Cancel
                    </Button>
                    <Button
                        variant='default'
                        onClick={() => void handleSave()}
                        disabled={saving}
                        className='flex items-center gap-1.5 px-3 py-1.5 rounded-md text-label font-medium bg-primary text-primary-foreground ui-control-emphasis-hover disabled:opacity-50'
                    >
                        {saving && <Loader2 size={12} className='animate-spin' />}
                        Save
                    </Button>
                </div>
            )}
        </div>
    );
};
