// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { EXPLORER_FILTER_DEBOUNCE_MS, ExplorerToolbar } from './ExplorerToolbar';

const noop = () => undefined;

function renderToolbar(
    overrides: { filter?: string; updateExplorerUiState?: (n: unknown) => void } = {},
) {
    const updateExplorerUiState = overrides.updateExplorerUiState ?? vi.fn();
    const utils = render(
        React.createElement(ExplorerToolbar, {
            filter: overrides.filter ?? '',
            fuzzyMatch: false,
            selectedSchema: '__all_schemas__',
            showMoreCategories: false,
            hasSecondaryCategories: false,
            availableSchemas: ['dbo'],
            filterInputRef: React.createRef<HTMLInputElement>(),
            updateExplorerUiState: updateExplorerUiState as never,
        }),
    );
    return { ...utils, updateExplorerUiState };
}

describe('ExplorerToolbar filter debounce', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it('paints every keystroke but only publishes the filter after the quiet period', () => {
        vi.useFakeTimers();
        const { updateExplorerUiState } = renderToolbar();
        const input = screen.getByPlaceholderText('Filter objects...') as HTMLInputElement;

        fireEvent.change(input, { target: { value: 'c' } });
        fireEvent.change(input, { target: { value: 'cu' } });
        fireEvent.change(input, { target: { value: 'cus' } });

        // The box shows what was typed...
        expect(input.value).toBe('cus');
        // ...but the store (and therefore the tree rebuild) has not been touched.
        expect(updateExplorerUiState).not.toHaveBeenCalled();

        act(() => {
            vi.advanceTimersByTime(EXPLORER_FILTER_DEBOUNCE_MS);
        });

        expect(updateExplorerUiState).toHaveBeenCalledTimes(1);
        expect(updateExplorerUiState).toHaveBeenCalledWith({ filter: 'cus' });
    });

    it('publishes immediately when the field loses focus', () => {
        vi.useFakeTimers();
        const { updateExplorerUiState } = renderToolbar();
        const input = screen.getByPlaceholderText('Filter objects...') as HTMLInputElement;

        fireEvent.change(input, { target: { value: 'cust' } });
        fireEvent.blur(input);

        expect(updateExplorerUiState).toHaveBeenCalledWith({ filter: 'cust' });
    });

    it('tabs from the filter into the first result', () => {
        render(
            <div data-tour='database-explorer'>
                <ExplorerToolbar
                    filter=''
                    fuzzyMatch={false}
                    selectedSchema='__all_schemas__'
                    showMoreCategories={false}
                    hasSecondaryCategories={false}
                    availableSchemas={['dbo']}
                    filterInputRef={React.createRef<HTMLInputElement>()}
                    updateExplorerUiState={noop as never}
                />
                <div data-explorer-focusable='' tabIndex={0} data-testid='first-result' />
            </div>,
        );
        const input = screen.getByPlaceholderText('Filter objects...') as HTMLInputElement;
        const firstResult = screen.getByTestId('first-result');

        fireEvent.keyDown(input, { key: 'Tab' });

        expect(document.activeElement).toBe(firstResult);
    });

    it('clears and publishes at once on Escape', () => {
        vi.useFakeTimers();
        const { updateExplorerUiState } = renderToolbar({ filter: 'cust' });
        const input = screen.getByPlaceholderText('Filter objects...') as HTMLInputElement;

        fireEvent.keyDown(input, { key: 'Escape' });

        expect(input.value).toBe('');
        expect(updateExplorerUiState).toHaveBeenCalledWith({ filter: '' });
    });
});
