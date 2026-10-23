// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { Button } from './button';
import { ConfirmDialog } from './ConfirmDialog';
import { Input } from './input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './select';
import { Switch } from './switch';
import { AppShell, DataEmpty, FormSection } from './app-shell-pattern';
import {
    buttonDestructive,
    buttonGhost,
    controlGhost,
    controlSurface,
    interactiveCommandItem,
    interactiveDestructive,
    interactiveGhostField,
    interactiveTabTrigger,
} from './contract';

describe('design system contract', () => {
    it('applies primitive control contract props', () => {
        render(
            <div>
                <Button tone='destructive' state='loading' density='compact'>
                    Delete
                </Button>
                <Button aria-label='Search' size='icon'>
                    <Search />
                </Button>
                <Button size='micro'>More</Button>
                <Input aria-label='Name' tone='warning' state='error' density='compact' />
                <Switch aria-label='Auto update' tone='success' state='default' />
            </div>,
        );

        expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
            'data-tone',
            'destructive',
        );
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
            'data-state',
            'loading',
        );
        expect(screen.getByRole('button', { name: 'Delete' }).className).toContain(
            '[height:var(--control-height-default)]',
        );
        expect(screen.getByRole('button', { name: 'Delete' }).className).toContain(controlSurface);
        expect(screen.getByRole('button', { name: 'Delete' }).className).toContain(
            interactiveDestructive,
        );
        expect(screen.getByRole('button', { name: 'Delete' })).toHaveAttribute(
            'data-content',
            'text',
        );
        expect(screen.getByRole('button', { name: 'Search' }).className).toContain(
            '[width:var(--control-height-icon)]',
        );
        expect(screen.getByRole('button', { name: 'More' }).className).toContain(
            '[height:var(--control-height-micro)]',
        );
        expect(screen.getByLabelText('Name')).toHaveAttribute('data-state', 'error');
        expect(screen.getByLabelText('Name').className).toContain(
            '[height:var(--control-height-default)]',
        );
        expect(screen.getByLabelText('Name').className).toContain(controlSurface);
        expect(screen.getByRole('switch', { name: 'Auto update' })).toHaveAttribute(
            'data-tone',
            'success',
        );
    });

    it('supports the info status tone', () => {
        render(
            <Button variant='ghost' tone='info'>
                Info
            </Button>,
        );
        expect(screen.getByRole('button', { name: 'Info' })).toHaveAttribute('data-tone', 'info');
    });

    it('applies select trigger contract props', () => {
        render(
            <Select defaultValue='light'>
                <SelectTrigger aria-label='Theme select' tone='warning' state='error'>
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value='light'>Light</SelectItem>
                    <SelectItem value='dark'>Dark</SelectItem>
                </SelectContent>
            </Select>,
        );

        expect(screen.getByRole('combobox', { name: /theme select/i })).toHaveAttribute(
            'data-tone',
            'warning',
        );
        expect(screen.getByRole('combobox', { name: /theme select/i })).toHaveAttribute(
            'data-ui-state',
            'error',
        );
        expect(screen.getByRole('combobox', { name: /theme select/i }).className).toContain(
            '[height:var(--control-height-default)]',
        );
        expect(screen.getByRole('combobox', { name: /theme select/i }).className).toContain(
            controlGhost,
        );
    });

    it('keeps button typography consistent across variants and tones', () => {
        render(
            <div>
                <Button variant='destructive'>Destructive</Button>
                <Button variant='default' tone='default'>
                    Default
                </Button>
                <Button variant='outline' tone='success'>
                    Outline Success
                </Button>
                <Button variant='ghost' tone='warning'>
                    Ghost Warning
                </Button>
            </div>,
        );

        const classNames = [
            screen.getByRole('button', { name: 'Destructive' }).className,
            screen.getByRole('button', { name: 'Default' }).className,
            screen.getByRole('button', { name: 'Outline Success' }).className,
            screen.getByRole('button', { name: 'Ghost Warning' }).className,
        ];

        for (const className of classNames) {
            expect(className).toContain('font-sans');
            expect(className).toContain('font-normal');
            expect(className).toContain('leading-none');
            expect(className).toContain('ui-text-small');
            expect(className).toContain('[height:var(--control-height-default)]');
        }
    });

    it('renders composite shell and state patterns', () => {
        render(
            <AppShell header={<div>Header</div>}>
                <FormSection title='General' description='Baseline settings'>
                    <div>Body</div>
                </FormSection>
                <DataEmpty title='No settings found' description='Try another keyword.' />
            </AppShell>,
        );

        expect(screen.getByText('Header')).toBeInTheDocument();
        expect(screen.getByText('General')).toBeInTheDocument();
        expect(screen.getByText('No settings found')).toBeInTheDocument();
    });

    it('exports semantic interaction recipes through primitives', () => {
        render(
            <div>
                <Input aria-label='Search input' variant='ghost' />
                <Button variant='ghost'>Ghost</Button>
            </div>,
        );

        expect(screen.getByLabelText('Search input').className).toContain(interactiveGhostField);
        expect(screen.getByRole('button', { name: 'Ghost' }).className).toContain(buttonGhost);
        expect(typeof interactiveTabTrigger).toBe('string');
        expect(typeof interactiveCommandItem).toBe('string');
    });

    it('exposes ConfirmDialog with a stable title/description/action contract', () => {
        const onCancel = vi.fn();
        const onConfirm = vi.fn();

        render(
            <ConfirmDialog
                open
                title='Drop Index'
                description='Drop index "idx_users_email"?'
                helperText='This will drop immediately and cannot be undone.'
                confirmLabel='Drop'
                destructive
                onCancel={onCancel}
                onConfirm={onConfirm}
            />,
        );

        expect(screen.getByText('Drop Index')).toBeInTheDocument();
        expect(screen.getByText('Drop index "idx_users_email"?')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
        expect(onCancel).toHaveBeenCalledTimes(1);

        const confirmButton = screen.getByRole('button', { name: 'Drop' });
        fireEvent.click(confirmButton);
        expect(onConfirm).toHaveBeenCalledTimes(1);
        expect(confirmButton.className).toContain(buttonDestructive);
    });
});
