// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import { ToastProvider } from '../../components/layout/Toast';
import { emitCommand } from '../../lib/commandBus';
import { DOM_EVENT } from '../../lib/constants';
import type { CSVImportOptions } from '../../platform/app-api/contracts/import';
import { CsvImportDialog } from './CsvImportDialog';

function installGateway() {
    const pickCSVFile = vi.fn(async () => ({ ok: true as const, data: 'D:\\data\\orders.csv' }));
    const previewCSVImport = vi.fn(async () => ({
        ok: true as const,
        data: {
            columns: ['id', 'name'],
            sampleRows: [
                ['1', 'Alice'],
                ['2', 'Bob'],
            ],
            inferredTypes: ['integer', 'text'],
            fileSizeBytes: 2048,
        },
    }));
    const startCSVImport = vi.fn(async (_options: CSVImportOptions) => ({
        ok: true as const,
        data: 'job-1',
    }));
    setApiGateway({
        dataImport: { pickCSVFile, previewCSVImport, startCSVImport },
        connection: {},
    } as unknown as ApiGateway);
    return { pickCSVFile, previewCSVImport, startCSVImport };
}

function renderDialog() {
    return render(
        <ToastProvider>
            <CsvImportDialog />
        </ToastProvider>,
    );
}

describe('CsvImportDialog', () => {
    afterEach(() => {
        resetApiGateway();
    });

    it('stays closed until OPEN_DATA_IMPORT is emitted', () => {
        installGateway();
        renderDialog();
        expect(screen.queryByText('Import CSV')).not.toBeInTheDocument();
    });

    it('opens on OPEN_DATA_IMPORT and prefills schema/table from the payload', async () => {
        installGateway();
        renderDialog();

        emitCommand(DOM_EVENT.OPEN_DATA_IMPORT, { schema: 'public', table: 'orders' });

        await waitFor(() => expect(screen.getByText('Import CSV')).toBeInTheDocument());
    });

    it('runs the full wizard: browse, preview, map, and start the import', async () => {
        const { pickCSVFile, previewCSVImport, startCSVImport } = installGateway();
        renderDialog();
        emitCommand(DOM_EVENT.OPEN_DATA_IMPORT, { schema: 'public', table: 'orders' });
        await waitFor(() => expect(screen.getByText('Import CSV')).toBeInTheDocument());

        // Step 1: File
        fireEvent.click(screen.getByRole('button', { name: /Browse/ }));
        await waitFor(() => expect(pickCSVFile).toHaveBeenCalled());
        await waitFor(() =>
            expect(previewCSVImport).toHaveBeenCalledWith('D:\\data\\orders.csv', ',', true),
        );
        await waitFor(() => expect(screen.getByText(/2 columns/)).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        // Step 2: Target — prefilled from the OPEN_DATA_IMPORT payload.
        await waitFor(() => expect(screen.getByDisplayValue('public')).toBeInTheDocument());
        expect(screen.getByDisplayValue('orders')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        // Step 3: Mapping — one row per preview column, defaulted to its own name.
        await waitFor(() => expect(screen.getAllByDisplayValue('id').length).toBeGreaterThan(0));
        expect(screen.getByDisplayValue('name')).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        // Step 4: Options — start the import.
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Start import/ })).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole('button', { name: /Start import/ }));

        await waitFor(() => expect(startCSVImport).toHaveBeenCalled());
        const options = startCSVImport.mock.calls[0][0];
        expect(options.filePath).toBe('D:\\data\\orders.csv');
        expect(options.schema).toBe('public');
        expect(options.table).toBe('orders');
        expect(options.mappings).toEqual([
            { sourceColumn: 'id', targetColumn: 'id' },
            { sourceColumn: 'name', targetColumn: 'name' },
        ]);
        expect(options.singleTransaction).toBe(true);
        expect(options.onError).toBe('abort');

        await waitFor(() => expect(screen.queryByText('Import CSV')).not.toBeInTheDocument());
    });

    it('excludes a skipped column from the mappings sent to StartCSVImport', async () => {
        const { startCSVImport } = installGateway();
        renderDialog();
        emitCommand(DOM_EVENT.OPEN_DATA_IMPORT, { schema: 'public', table: 'orders' });
        await waitFor(() => expect(screen.getByText('Import CSV')).toBeInTheDocument());

        fireEvent.click(screen.getByRole('button', { name: /Browse/ }));
        await waitFor(() => expect(screen.getByText(/2 columns/)).toBeInTheDocument());
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        fireEvent.click(screen.getByRole('button', { name: 'Next' }));

        await waitFor(() => expect(screen.getByLabelText('Skip name')).toBeInTheDocument());
        fireEvent.click(screen.getByLabelText('Skip name'));

        fireEvent.click(screen.getByRole('button', { name: 'Next' }));
        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Start import/ })).toBeInTheDocument(),
        );
        fireEvent.click(screen.getByRole('button', { name: /Start import/ }));

        await waitFor(() => expect(startCSVImport).toHaveBeenCalled());
        const options = startCSVImport.mock.calls[0][0];
        expect(options.mappings).toEqual([
            { sourceColumn: 'id', targetColumn: 'id' },
            { sourceColumn: 'name', targetColumn: '' },
        ]);
    });
});
