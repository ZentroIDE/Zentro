// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Badge,
    Button,
    Checkbox,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Input,
    Label,
    RadioGroup,
    RadioGroupItem,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../../components/ui';
import { onCommand } from '../../lib/commandBus';
import { DOM_EVENT } from '../../lib/constants';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { kernelErrorMessage } from '../../shared/kernel';
import { useToast } from '../../components/layout/Toast';
import { useConnectionStore } from '../../stores/connectionStore';
import type {
    CSVImportOptions,
    CSVImportPreview,
    ImportColumnMapping,
} from '../../platform/app-api/contracts/import';

type WizardStep = 1 | 2 | 3 | 4;

const DELIMITER_OPTIONS = [
    { value: ',', label: 'Comma  ,' },
    { value: ';', label: 'Semicolon  ;' },
    { value: '\t', label: 'Tab' },
    { value: '|', label: 'Pipe  |' },
];

const DEFAULT_BATCH_SIZE = 1000;

interface MappingRow {
    sourceColumn: string;
    targetColumn: string;
    inferredType: string;
    skip: boolean;
}

function initialMappingRows(preview: CSVImportPreview): MappingRow[] {
    return preview.columns.map((col, i) => ({
        sourceColumn: col,
        targetColumn: col,
        inferredType: preview.inferredTypes[i] ?? 'text',
        skip: false,
    }));
}

/** CSV → table import wizard. Self-contained: mount it once (see
 *  app/AppShell.tsx) and it opens itself on DOM_EVENT.OPEN_DATA_IMPORT,
 *  optionally prefilled with a schema/table from the explorer's "Import..."
 *  context menu item. Started imports run as Activity-panel jobs (see
 *  import_service.go) — this dialog only collects options and starts one;
 *  progress/cancel happen in the Activity panel afterward. */
export function CsvImportDialog() {
    const { toast } = useToast();
    const activeProfile = useConnectionStore(state => state.activeProfile);

    const [open, setOpen] = React.useState(false);
    const [step, setStep] = React.useState<WizardStep>(1);

    const [filePath, setFilePath] = React.useState('');
    const [delimiter, setDelimiter] = React.useState(',');
    const [hasHeader, setHasHeader] = React.useState(true);
    const [preview, setPreview] = React.useState<CSVImportPreview | null>(null);
    const [previewLoading, setPreviewLoading] = React.useState(false);
    const [previewError, setPreviewError] = React.useState<string | null>(null);

    const [schema, setSchema] = React.useState('');
    const [table, setTable] = React.useState('');

    const [mappingRows, setMappingRows] = React.useState<MappingRow[]>([]);
    const [nullToken, setNullToken] = React.useState('');
    const [trimWhitespace, setTrimWhitespace] = React.useState(true);

    const [batchSize, setBatchSize] = React.useState(DEFAULT_BATCH_SIZE);
    const [onError, setOnError] = React.useState<'abort' | 'skip'>('abort');
    const [singleTransaction, setSingleTransaction] = React.useState(true);
    const [truncateFirst, setTruncateFirst] = React.useState(false);
    const [starting, setStarting] = React.useState(false);

    const reset = React.useCallback(() => {
        setStep(1);
        setFilePath('');
        setDelimiter(',');
        setHasHeader(true);
        setPreview(null);
        setPreviewError(null);
        setSchema('');
        setTable('');
        setMappingRows([]);
        setNullToken('');
        setTrimWhitespace(true);
        setBatchSize(DEFAULT_BATCH_SIZE);
        setOnError('abort');
        setSingleTransaction(true);
        setTruncateFirst(false);
    }, []);

    React.useEffect(() => {
        return onCommand(DOM_EVENT.OPEN_DATA_IMPORT, payload => {
            reset();
            if (payload?.schema) setSchema(payload.schema);
            if (payload?.table) setTable(payload.table);
            setOpen(true);
        });
    }, [reset]);

    const loadPreview = React.useCallback(async (path: string, delim: string, header: boolean) => {
        if (!path) return;
        setPreviewLoading(true);
        setPreviewError(null);
        try {
            const result = await getApiGateway().dataImport.previewCSVImport(path, delim, header);
            if (!result.ok) {
                setPreview(null);
                setPreviewError(kernelErrorMessage(result.error));
                return;
            }
            setPreview(result.data);
            setMappingRows(initialMappingRows(result.data));
        } finally {
            setPreviewLoading(false);
        }
    }, []);

    const handleBrowse = async () => {
        const result = await getApiGateway().dataImport.pickCSVFile();
        if (!result.ok) {
            toast.error(`Could not open file picker: ${kernelErrorMessage(result.error)}`);
            return;
        }
        if (!result.data) return; // user cancelled
        setFilePath(result.data);
        void loadPreview(result.data, delimiter, hasHeader);
    };

    const handleDelimiterChange = (value: string) => {
        setDelimiter(value);
        if (filePath) void loadPreview(filePath, value, hasHeader);
    };

    const handleHeaderChange = (checked: boolean) => {
        setHasHeader(checked);
        if (filePath) void loadPreview(filePath, delimiter, checked);
    };

    const canGoToTarget = Boolean(preview) && !previewLoading && !previewError;
    const canGoToMapping = Boolean(schema.trim() || true) && Boolean(table.trim());
    const mappedCount = mappingRows.filter(r => !r.skip && r.targetColumn.trim()).length;
    const canStart = mappedCount > 0 && !starting;

    const handleStart = async () => {
        const mappings: ImportColumnMapping[] = mappingRows.map(r => ({
            sourceColumn: r.sourceColumn,
            targetColumn: r.skip ? '' : r.targetColumn.trim(),
        }));
        const options: CSVImportOptions = {
            filePath,
            delimiter,
            hasHeader,
            schema: schema.trim(),
            table: table.trim(),
            mappings,
            nullToken,
            trimWhitespace,
            batchSize,
            onError,
            singleTransaction,
            truncateFirst,
        };

        setStarting(true);
        try {
            const result = await getApiGateway().dataImport.startCSVImport(options);
            if (!result.ok) {
                toast.error(`Import failed to start: ${kernelErrorMessage(result.error)}`);
                return;
            }
            toast.success(`Import started: ${filePath.split(/[\\/]/).pop()} → ${table}`, {
                source: 'data-import.start',
            });
            setOpen(false);
        } finally {
            setStarting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent size='lg'>
                <DialogHeader>
                    <DialogTitle>Import CSV</DialogTitle>
                </DialogHeader>

                <div className='flex items-center gap-2 px-4 pb-2 text-label text-muted-foreground'>
                    {(['File', 'Target', 'Mapping', 'Options'] as const).map((label, i) => {
                        const n = (i + 1) as WizardStep;
                        return (
                            <React.Fragment key={label}>
                                {i > 0 && <span className='flex-1 h-px bg-border' />}
                                <span
                                    className={
                                        step === n ? 'font-semibold text-foreground' : undefined
                                    }
                                >
                                    {n}. {label}
                                </span>
                            </React.Fragment>
                        );
                    })}
                </div>

                <div className='px-4 pb-4 max-h-[60vh] overflow-auto flex flex-col gap-4'>
                    {step === 1 && (
                        <div className='flex flex-col gap-4'>
                            <div className='flex flex-col gap-1.5'>
                                <Label htmlFor='csv-file-path'>File</Label>
                                <div className='flex gap-2'>
                                    <Input
                                        id='csv-file-path'
                                        readOnly
                                        value={filePath}
                                        placeholder='No file selected'
                                        className='font-mono'
                                    />
                                    <Button variant='outline' onClick={handleBrowse}>
                                        Browse…
                                    </Button>
                                </div>
                            </div>

                            <div className='grid grid-cols-2 gap-4'>
                                <div className='flex flex-col gap-1.5'>
                                    <Label htmlFor='csv-delimiter'>Delimiter</Label>
                                    <Select value={delimiter} onValueChange={handleDelimiterChange}>
                                        <SelectTrigger id='csv-delimiter'>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {DELIMITER_OPTIONS.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>
                                                    {opt.label}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className='flex items-end gap-2 pb-1.5'>
                                    <Checkbox
                                        id='csv-has-header'
                                        checked={hasHeader}
                                        onCheckedChange={v => handleHeaderChange(v === true)}
                                    />
                                    <Label htmlFor='csv-has-header' className='font-normal!'>
                                        First row is header
                                    </Label>
                                </div>
                            </div>

                            {previewError && (
                                <p className='text-small text-destructive'>{previewError}</p>
                            )}
                            {previewLoading && (
                                <p className='text-small text-muted-foreground'>Reading preview…</p>
                            )}
                            {preview && !previewLoading && (
                                <div className='flex flex-col gap-2'>
                                    <p className='text-label text-muted-foreground'>
                                        Preview — first {preview.sampleRows.length} rows ·{' '}
                                        {preview.columns.length} columns ·{' '}
                                        {(preview.fileSizeBytes / 1024).toFixed(1)} KB
                                    </p>
                                    <div className='overflow-auto border border-border rounded-md'>
                                        <table className='w-full text-small font-mono'>
                                            <thead>
                                                <tr className='bg-muted/40'>
                                                    {preview.columns.map(col => (
                                                        <th
                                                            key={col}
                                                            className='text-left px-2 py-1 whitespace-nowrap'
                                                        >
                                                            {col}
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {preview.sampleRows.slice(0, 6).map((row, i) => (
                                                    <tr key={i} className='border-t border-border'>
                                                        {row.map((cell, j) => (
                                                            <td
                                                                key={j}
                                                                className='px-2 py-1 whitespace-nowrap'
                                                            >
                                                                {cell}
                                                            </td>
                                                        ))}
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && (
                        <div className='flex flex-col gap-4'>
                            <p className='text-small text-muted-foreground'>
                                Importing into{' '}
                                <strong className='text-foreground'>
                                    {activeProfile?.name || 'the active connection'}
                                </strong>
                                .
                            </p>
                            <div className='grid grid-cols-2 gap-4'>
                                <div className='flex flex-col gap-1.5'>
                                    <Label htmlFor='csv-schema'>Schema</Label>
                                    <Input
                                        id='csv-schema'
                                        value={schema}
                                        onChange={e => setSchema(e.target.value)}
                                        placeholder='public'
                                        className='font-mono'
                                    />
                                </div>
                                <div className='flex flex-col gap-1.5'>
                                    <Label htmlFor='csv-table'>Table</Label>
                                    <Input
                                        id='csv-table'
                                        value={table}
                                        onChange={e => setTable(e.target.value)}
                                        placeholder='orders'
                                        className='font-mono'
                                    />
                                </div>
                            </div>
                            <p className='text-label text-muted-foreground'>
                                The target table must already exist — creating a new table from a
                                CSV isn't supported yet.
                            </p>
                        </div>
                    )}

                    {step === 3 && (
                        <div className='flex flex-col gap-4'>
                            <div className='flex flex-col gap-2'>
                                <div className='grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center text-label font-semibold text-muted-foreground uppercase tracking-wide'>
                                    <span>CSV column</span>
                                    <span />
                                    <span>Target column</span>
                                    <span>Skip</span>
                                </div>
                                {mappingRows.map((row, i) => (
                                    <div
                                        key={row.sourceColumn}
                                        className='grid grid-cols-[1fr_auto_1fr_auto] gap-2 items-center'
                                    >
                                        <div className='flex items-center gap-2 min-w-0'>
                                            <span className='font-mono text-small truncate'>
                                                {row.sourceColumn}
                                            </span>
                                            <Badge variant='muted'>{row.inferredType}</Badge>
                                        </div>
                                        <span className='text-muted-foreground'>→</span>
                                        <Input
                                            value={row.targetColumn}
                                            disabled={row.skip}
                                            onChange={e => {
                                                const value = e.target.value;
                                                setMappingRows(rows =>
                                                    rows.map((r, idx) =>
                                                        idx === i
                                                            ? { ...r, targetColumn: value }
                                                            : r,
                                                    ),
                                                );
                                            }}
                                            className='font-mono'
                                        />
                                        <Checkbox
                                            checked={row.skip}
                                            onCheckedChange={checked =>
                                                setMappingRows(rows =>
                                                    rows.map((r, idx) =>
                                                        idx === i
                                                            ? { ...r, skip: checked === true }
                                                            : r,
                                                    ),
                                                )
                                            }
                                            aria-label={`Skip ${row.sourceColumn}`}
                                        />
                                    </div>
                                ))}
                            </div>

                            <div className='grid grid-cols-2 gap-4'>
                                <div className='flex flex-col gap-1.5'>
                                    <Label htmlFor='csv-null-token'>NULL token</Label>
                                    <Input
                                        id='csv-null-token'
                                        value={nullToken}
                                        onChange={e => setNullToken(e.target.value)}
                                        placeholder='(none)'
                                        className='font-mono'
                                    />
                                </div>
                                <div className='flex items-end gap-2 pb-1.5'>
                                    <Checkbox
                                        id='csv-trim'
                                        checked={trimWhitespace}
                                        onCheckedChange={v => setTrimWhitespace(v === true)}
                                    />
                                    <Label htmlFor='csv-trim' className='font-normal!'>
                                        Trim whitespace
                                    </Label>
                                </div>
                            </div>
                        </div>
                    )}

                    {step === 4 && (
                        <div className='flex flex-col gap-4'>
                            <div className='flex flex-col gap-1.5 w-48'>
                                <Label htmlFor='csv-batch-size'>Batch size (rows per INSERT)</Label>
                                <Input
                                    id='csv-batch-size'
                                    type='number'
                                    min={1}
                                    value={batchSize}
                                    onChange={e =>
                                        setBatchSize(Math.max(1, Number(e.target.value) || 1))
                                    }
                                />
                            </div>

                            <div className='flex flex-col gap-2'>
                                <Label>When a row fails</Label>
                                <RadioGroup
                                    value={onError}
                                    onValueChange={v => setOnError(v as 'abort' | 'skip')}
                                    className='flex flex-col gap-2'
                                >
                                    <div className='flex items-center gap-2'>
                                        <RadioGroupItem value='abort' id='csv-onerror-abort' />
                                        <Label htmlFor='csv-onerror-abort' className='font-normal!'>
                                            Abort and roll back
                                        </Label>
                                    </div>
                                    <div className='flex items-center gap-2'>
                                        <RadioGroupItem value='skip' id='csv-onerror-skip' />
                                        <Label htmlFor='csv-onerror-skip' className='font-normal!'>
                                            Skip the row and log it (up to 100 errors)
                                        </Label>
                                    </div>
                                </RadioGroup>
                            </div>

                            <div className='flex items-center gap-2'>
                                <Checkbox
                                    id='csv-single-tx'
                                    checked={singleTransaction}
                                    onCheckedChange={v => setSingleTransaction(v === true)}
                                />
                                <Label htmlFor='csv-single-tx' className='font-normal!'>
                                    Run in a single transaction (cancel rolls everything back)
                                </Label>
                            </div>
                            <div className='flex items-center gap-2'>
                                <Checkbox
                                    id='csv-truncate'
                                    checked={truncateFirst}
                                    onCheckedChange={v => setTruncateFirst(v === true)}
                                />
                                <Label htmlFor='csv-truncate' className='font-normal!'>
                                    Truncate {schema ? `${schema}.` : ''}
                                    {table || 'the table'} first
                                </Label>
                            </div>

                            <p className='text-label text-muted-foreground'>
                                {mappedCount} column{mappedCount === 1 ? '' : 's'} mapped into{' '}
                                {schema ? `${schema}.` : ''}
                                {table}. Runs as a background job — track or cancel it from the
                                Activity panel.
                            </p>
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant='ghost' onClick={() => setOpen(false)}>
                        Cancel
                    </Button>
                    <div className='flex-1' />
                    {step > 1 && (
                        <Button
                            variant='outline'
                            onClick={() => setStep(prev => (prev - 1) as WizardStep)}
                        >
                            Back
                        </Button>
                    )}
                    {step < 4 && (
                        <Button
                            onClick={() => setStep(prev => (prev + 1) as WizardStep)}
                            disabled={
                                (step === 1 && !canGoToTarget) || (step === 2 && !canGoToMapping)
                            }
                        >
                            Next
                        </Button>
                    )}
                    {step === 4 && (
                        <Button onClick={handleStart} disabled={!canStart}>
                            {starting ? 'Starting…' : 'Start import'}
                        </Button>
                    )}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
