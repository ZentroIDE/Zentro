// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useRef } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../../components/ui';

export interface FKSelectCellProps {
    value: string | undefined;
    options: string[];
    placeholder?: string;
    disabled?: boolean;
    onValueChange: (value: string) => void;
    onClose: () => void;
}

export const FKSelectCell: React.FC<FKSelectCellProps> = ({
    value,
    options,
    placeholder,
    disabled,
    onValueChange,
    onClose,
}) => {
    const triggerRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        const id = requestAnimationFrame(() => {
            triggerRef.current?.click();
        });
        return () => cancelAnimationFrame(id);
    }, []);

    return (
        <Select
            value={value}
            onValueChange={v => {
                onValueChange(v);
                onClose();
            }}
            onOpenChange={open => {
                if (!open) onClose();
            }}
            disabled={disabled}
        >
            <SelectTrigger ref={triggerRef} className=' border-accent w-full'>
                <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
                {options.map(opt => (
                    <SelectItem key={opt} value={opt}>
                        {opt}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
};
