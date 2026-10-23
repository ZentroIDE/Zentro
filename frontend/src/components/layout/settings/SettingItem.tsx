// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Label, Switch } from '../../ui';

interface SettingFieldProps {
    label: string;
    helperText?: string;
    children: React.ReactNode;
}

export const SettingField: React.FC<SettingFieldProps> = ({ label, helperText, children }) => (
    <div className='space-y-1.5'>
        <Label>{label}</Label>
        {children}
        {helperText && <p className='text-label text-muted-foreground'>{helperText}</p>}
    </div>
);

interface SettingToggleProps {
    title: string;
    description: string;
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
    ariaLabel?: string;
}

export const SettingToggle: React.FC<SettingToggleProps> = ({
    title,
    description,
    checked,
    onCheckedChange,
    disabled,
    ariaLabel,
}) => (
    <div className='flex items-center justify-between rounded-md py-2.5'>
        <div className='flex flex-col gap-0.5'>
            <span className='text-small font-semibold text-foreground'>{title}</span>
            <span className='text-label text-muted-foreground'>{description}</span>
        </div>
        <Switch
            checked={checked}
            onCheckedChange={onCheckedChange}
            disabled={disabled}
            aria-label={ariaLabel ?? title}
        />
    </div>
);

interface SettingGroupTitleProps {
    title: string;
    description?: string;
}

// SettingGroupTitle names a group of rows inside one section. Groups are told
// apart by this title and by space, never by a border or a card.
export const SettingGroupTitle: React.FC<SettingGroupTitleProps> = ({ title, description }) => (
    <div className='flex flex-col gap-0.5 pt-3'>
        <span className='text-label font-semibold tracking-wide text-muted-foreground uppercase'>
            {title}
        </span>
        {description && <span className='text-label text-muted-foreground'>{description}</span>}
    </div>
);

interface SettingActionProps {
    title: string;
    description?: React.ReactNode;
    children: React.ReactNode;
}

// SettingAction is a row with buttons on the right. It has the same shape as
// SettingToggle, so a row of actions lines up with a row of switches.
export const SettingAction: React.FC<SettingActionProps> = ({ title, description, children }) => (
    <div className='flex items-center justify-between gap-3 py-2.5'>
        <div className='flex min-w-0 flex-col gap-0.5'>
            <span className='text-small font-semibold text-foreground'>{title}</span>
            {description && <span className='text-label text-muted-foreground'>{description}</span>}
        </div>
        <div className='flex shrink-0 items-center gap-1.5'>{children}</div>
    </div>
);
