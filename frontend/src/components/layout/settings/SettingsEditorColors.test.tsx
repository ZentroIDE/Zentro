// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SettingsEditorColors } from './SettingsEditorColors';
import { DEFAULT_SQL_EDITOR_STYLE, SQL_COLOR_PALETTE } from '../../../lib/sqlEditorStyle';

function setup(value = DEFAULT_SQL_EDITOR_STYLE, currentAppearance: 'light' | 'dark' = 'light') {
    const onChange = vi.fn();
    render(
        <SettingsEditorColors
            value={value}
            currentAppearance={currentAppearance}
            onChange={onChange}
        />,
    );
    return onChange;
}

/** The colour choices live in a hover card that also opens on keyboard focus. */
async function openColours(label: string, current = 'Theme default') {
    fireEvent.focus(screen.getByRole('button', { name: `${label} colour: ${current}` }));
    return screen.findByRole('radiogroup', { name: `${label} colour` });
}

describe('SettingsEditorColors', () => {
    it('starts on the current theme and switches with the two buttons', () => {
        setup(DEFAULT_SQL_EDITOR_STYLE, 'dark');
        expect(screen.getByRole('button', { name: 'Dark themes' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        fireEvent.click(screen.getByRole('button', { name: 'Light themes' }));
        expect(screen.getByRole('button', { name: 'Light themes' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(screen.getByRole('button', { name: 'Dark themes' })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
        expect(
            screen.getByRole('img', { name: 'Preview of the SQL editor in the light theme' }),
        ).toBeInTheDocument();
    });

    it('shows the preview for the active theme', () => {
        setup();
        expect(
            screen.getByRole('img', { name: 'Preview of the SQL editor in the light theme' }),
        ).toBeInTheDocument();
    });

    it('shows only the active colour until the choices are opened', async () => {
        setup();
        expect(screen.queryByRole('radio', { name: /^Keywords:/ })).not.toBeInTheDocument();
        await openColours('Keywords');
        expect(screen.getAllByRole('radio', { name: /^Keywords:/ })).toHaveLength(7);
    });

    it('picks a colour from the palette of the edited appearance', async () => {
        const onChange = setup();
        const blue = SQL_COLOR_PALETTE.light[0];
        await openColours('Keywords');
        fireEvent.click(screen.getByRole('radio', { name: `Keywords: ${blue.name}` }));
        expect(onChange).toHaveBeenCalledWith({
            ...DEFAULT_SQL_EDITOR_STYLE,
            light: { keyword: { color: blue.value, weight: 'normal', italic: false } },
        });
    });

    it('names the active colour on its trigger and marks it inside the choices', async () => {
        const green = SQL_COLOR_PALETTE.light[2];
        setup({
            ...DEFAULT_SQL_EDITOR_STYLE,
            light: { keyword: { color: green.value, weight: 'normal', italic: false } },
        });
        await openColours('Keywords', green.name);
        expect(screen.getByRole('radio', { name: `Keywords: ${green.name}` })).toHaveAttribute(
            'aria-checked',
            'true',
        );
        expect(screen.getByRole('radio', { name: 'Keywords: Theme default' })).toHaveAttribute(
            'aria-checked',
            'false',
        );
    });

    it('toggles italic with the icon button', () => {
        const onChange = setup();
        fireEvent.click(screen.getByRole('button', { name: 'Comments italic' }));
        expect(onChange).toHaveBeenCalledWith({
            ...DEFAULT_SQL_EDITOR_STYLE,
            light: { comment: { color: '', weight: 'normal', italic: true } },
        });
    });

    it('offers normal, semi-bold and bold for every category', () => {
        setup();
        fireEvent.click(screen.getByRole('combobox', { name: 'Keywords font weight' }));
        expect(screen.getByRole('option', { name: 'Normal' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Semi-bold' })).toBeInTheDocument();
        expect(screen.getByRole('option', { name: 'Bold' })).toBeInTheDocument();
    });

    it('removes an entry when it is reset', () => {
        const onChange = setup({
            ...DEFAULT_SQL_EDITOR_STYLE,
            light: { keyword: { color: '#0b57d0', weight: 'bold', italic: false } },
        });
        fireEvent.click(screen.getAllByRole('button', { name: 'Reset' })[0]);
        expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SQL_EDITOR_STYLE, light: {} });
    });

    it('offers the schema-name rows only when schema highlighting is on', () => {
        setup({ ...DEFAULT_SQL_EDITOR_STYLE, schemaHighlight: true });
        expect(
            screen.getByRole('button', { name: 'Table names colour: Theme default' }),
        ).toBeInTheDocument();
    });
});
