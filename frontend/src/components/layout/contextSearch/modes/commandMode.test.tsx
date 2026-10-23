// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Command } from '../../../ui';
import { commandMode } from './commandMode';

const actionSpy = vi.fn();

vi.mock('../../../../lib/commands', () => ({
    buildCommands: () => [
        {
            id: 'editor.runQuery',
            label: 'Run Query',
            category: 'Editor',
            keybinding: 'Ctrl+Enter',
            action: actionSpy,
        },
        {
            id: 'view.commandPalette',
            label: 'Open Command Palette',
            category: 'View',
            keybinding: 'Ctrl+Shift+P',
            action: vi.fn(),
        },
        {
            id: 'app.reload',
            label: 'Reload Application',
            category: 'App',
            keybinding: 'Ctrl+Shift+R',
            action: vi.fn(),
        },
        {
            id: 'connection.switchEnvDevelopment',
            label: 'Switch Environment: Development',
            category: 'Connection',
            keybinding: 'Shift+Alt+D',
            action: vi.fn(),
        },
    ],
}));

const renderCommandResults = (query: string, onClose = vi.fn()) => {
    render(
        <Command shouldFilter={false}>
            <commandMode.Results query={query} onClose={onClose} />
        </Command>,
    );
    return onClose;
};

describe('commandMode', () => {
    it('renders app commands and excludes the palette self-entry', () => {
        renderCommandResults('');

        expect(screen.getByText('Run Query')).toBeInTheDocument();
        expect(screen.queryByText('Open Command Palette')).not.toBeInTheDocument();
        expect(screen.getByText('Ctrl+Enter')).toBeInTheDocument();
    });

    it('closes and runs the selected command', () => {
        const onClose = renderCommandResults('');

        fireEvent.click(screen.getByText('Run Query'));

        expect(onClose).toHaveBeenCalledTimes(1);
        expect(actionSpy).toHaveBeenCalledTimes(1);
    });

    it('filters commands by fuzzy query', () => {
        renderCommandResults('zzzz');

        expect(screen.queryByText('Run Query')).not.toBeInTheDocument();
    });

    it('matches substrings only — no scattered-subsequence hits', () => {
        renderCommandResults('reload');

        expect(screen.getByText('Reload Application')).toBeInTheDocument();
        expect(screen.queryByText('Switch Environment: Development')).not.toBeInTheDocument();
        expect(screen.queryByText('Run Query')).not.toBeInTheDocument();
    });

    it('requires every token to match', () => {
        renderCommandResults('run query');

        expect(screen.getByText('Run Query')).toBeInTheDocument();
        expect(screen.queryByText('Reload Application')).not.toBeInTheDocument();
    });
});
