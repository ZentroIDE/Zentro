// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../components/ui';

interface ConstraintSectionHeaderProps {
    icon: React.ReactNode;
    label: string;
    onAdd?: () => void;
    addLabel?: string;
    readOnly?: boolean;
    disabled?: boolean;
}

export const ConstraintSectionHeader: React.FC<ConstraintSectionHeaderProps> = ({
    icon,
    label,
    onAdd,
    addLabel,
    readOnly,
    disabled,
}) => (
    <div className='flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30'>
        <div className='flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider'>
            {icon}
            {label}
        </div>
        {!readOnly && onAdd && (
            <Button
                type='button'
                variant='ghost'
                onClick={onAdd}
                disabled={disabled}
                className='h-6 px-2 text-[11px] gap-1 text-muted-foreground ui-interactive-surface'
            >
                <Plus size={10} />
                {addLabel}
            </Button>
        )}
    </div>
);
