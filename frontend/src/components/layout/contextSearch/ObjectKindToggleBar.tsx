// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    ChevronsDownUp,
    ChevronsUpDown,
    Database,
    ListChevronsDownUp,
    ListChevronsUpDown,
    Minus,
    Plus,
    Rows2,
    Rows4,
} from 'lucide-react';

import { cn } from '../../../lib/cn';
import {
    KIND_LABEL,
    PRIMARY_VISIBLE_KINDS,
    type ObjectKind,
} from '../../../lib/contextSearchTemplates';
import { Button } from '../../ui';
import { KIND_ICON } from './kindIcons';

interface ObjectKindToggleBarProps {
    dbName: string;
    showAllKinds: boolean;
    enabledKinds: Set<ObjectKind>;
    onToggleKind: (kind: ObjectKind) => void;
    onToggleShowAllKinds: () => void;
}

export const ObjectKindToggleBar: React.FC<ObjectKindToggleBarProps> = ({
    dbName,
    showAllKinds,
    enabledKinds,
    onToggleKind,
    onToggleShowAllKinds,
}) => (
    <>
        <div className='absolute top-5 right-3 -translate-y-1/2 inline-flex items-center gap-1'>
            <span className='text-small text-muted-foreground inline-flex select-all items-center gap-1'>
                {dbName || 'No DB'}
            </span>
            <Button
                type='button'
                variant='ghost'
                size='icon'
                title={showAllKinds ? 'Show fewer object types' : 'Show more object types'}
                onClick={onToggleShowAllKinds}
            >
                {showAllKinds ? <Rows2 size={13} /> : <Rows4 size={13} />}
            </Button>
        </div>

        <div className='px-3 py-1 border-b border-border bg-card flex items-center gap-2 flex-wrap'>
            {(showAllKinds ? (Object.keys(KIND_LABEL) as ObjectKind[]) : PRIMARY_VISIBLE_KINDS).map(
                kind => {
                    const active = enabledKinds.has(kind);
                    return (
                        <Button
                            key={kind}
                            type='button'
                            size='sm'
                            variant={active ? 'secondary' : 'ghost'}
                            className={cn(
                                active
                                    ? 'border-primary/40 bg-primary/15 text-foreground'
                                    : 'text-muted-foreground',
                            )}
                            onClick={() => onToggleKind(kind)}
                        >
                            {KIND_ICON[kind]}
                            <span>{KIND_LABEL[kind]}</span>
                        </Button>
                    );
                },
            )}
        </div>
    </>
);
