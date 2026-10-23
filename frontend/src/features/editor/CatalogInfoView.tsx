// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useMemo, useState } from 'react';
import { FileCode2, Hash, Sigma, Type, Zap, RotateCcw, Eye, Code, Check, X } from 'lucide-react';
import { getErrorMessage } from '../../lib/errors';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import type { CatalogObjectDetails } from '../../platform/app-api/types';
import { useSettingsStore } from '../../stores/settingsStore';
import { useMonacoTheme } from '../../lib/theme';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { Badge, Button } from '../../components/ui';
import type { CatalogTabContext } from '../../stores/editor/types';

interface CatalogInfoViewProps {
    tabId: string;
    catalog: CatalogTabContext;
}

const iconByKind: Record<string, React.ReactNode> = {
    indexes: <Hash size={16} />,
    procedures: <Zap size={16} />,
    functions: <Zap size={16} />,
    sequence: <FileCode2 size={16} />,
    data_type: <Type size={16} />,
    aggregate_function: <Sigma size={16} />,
};

function prettifyKind(kind: string): string {
    return kind.replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export const CatalogInfoView: React.FC<CatalogInfoViewProps> = ({ catalog }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [details, setDetails] = useState<CatalogObjectDetails | null>(null);
    const [ddlValue, setDdlValue] = useState<string>('');
    const [showDiff, setShowDiff] = useState<boolean>(false);
    const [isConfirmingDiscard, setIsConfirmingDiscard] = useState<boolean>(false);

    const { theme } = useSettingsStore();
    const monacoTheme = useMonacoTheme(theme);

    useEffect(() => {
        let cancelled = false;
        if (!catalog.connectionID) {
            setError('No active connection profile.');
            setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        getApiGateway()
            .schema.getCatalogObjectDetails(
                catalog.connectionID,
                catalog.dbName,
                catalog.schema,
                catalog.objectKind,
                catalog.name,
                catalog.tableName,
            )
            .then(response => {
                if (cancelled) return;
                const result = unwrapOrThrow(response);
                setDetails(result);
                setDdlValue(result.ddl || '');
                setShowDiff(false);
                setIsConfirmingDiscard(false);
            })
            .catch(err => {
                if (cancelled) return;
                setError(getErrorMessage(err));
            })
            .finally(() => {
                if (cancelled) return;
                setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [
        catalog.name,
        catalog.objectKind,
        catalog.connectionID,
        catalog.dbName,
        catalog.schema,
        catalog.tableName,
    ]);

    const resolved = useMemo(() => details ?? null, [details]);

    return (
        <div className='flex h-full flex-col overflow-hidden bg-background'>
            <div className='flex-1 flex flex-col overflow-hidden p-4 pt-0 min-h-0'>
                {loading ? (
                    <div className='text-small text-muted-foreground p-2'>
                        Loading catalog object...
                    </div>
                ) : error ? (
                    <div className='rounded-md border border-destructive/20 bg-destructive/5 p-3 text-small text-destructive shrink-0'>
                        {error}
                    </div>
                ) : resolved?.unsupportedMessage ? (
                    <div className='rounded-md border border-border bg-muted/30 p-3 text-small text-muted-foreground shrink-0'>
                        {resolved.unsupportedMessage}
                    </div>
                ) : (
                    <>
                        {/* Compact Metadata Row */}
                        <div className='flex justify-between'>
                            <div className='h-8 flex items-center gap-2 text-label text-muted-foreground'>
                                <div className='flex items-center gap-1.5'>
                                    <span className='font-semibold text-foreground/80'>Kind:</span>
                                    <span>
                                        {prettifyKind(resolved?.objectKind || catalog.objectKind)}
                                    </span>
                                </div>
                                <div className='flex items-center gap-1.5'>
                                    <span className='font-semibold text-foreground/80'>
                                        Schema:
                                    </span>
                                    <span>{resolved?.schema || catalog.schema}</span>
                                </div>
                                {resolved?.tableName && (
                                    <>
                                        <div className='flex items-center gap-1.5'>
                                            <span className='font-semibold text-foreground/80'>
                                                Table:
                                            </span>
                                            <span>{resolved.tableName}</span>
                                        </div>
                                    </>
                                )}
                                {resolved?.objectKind === 'indexes' && (
                                    <>
                                        <div className='flex items-center gap-1.5'>
                                            <span className='font-semibold text-foreground/80'>
                                                Unique:
                                            </span>
                                            <span>{resolved.unique ? 'Yes' : 'No'}</span>
                                        </div>
                                        <div className='flex items-center gap-1.5'>
                                            <span className='font-semibold text-foreground/80'>
                                                PK:
                                            </span>
                                            <span>{resolved.primaryKey ? 'Yes' : 'No'}</span>
                                        </div>
                                    </>
                                )}
                                {resolved?.signature && (
                                    <>
                                        <div className='flex items-center gap-1.5'>
                                            <span className='font-semibold text-foreground/80'>
                                                Signature:
                                            </span>
                                            <span>{resolved.signature}</span>
                                        </div>
                                    </>
                                )}
                                {resolved?.columns && resolved.columns.length > 0 && (
                                    <>
                                        <div className='flex items-center gap-1.5'>
                                            <span className='font-semibold text-foreground/80'>
                                                Columns:
                                            </span>
                                            <span>{resolved.columns.join(', ')}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                            {ddlValue !== (resolved?.ddl || '') && (
                                <div className='flex items-center gap-2'>
                                    <Badge variant='warning'>Modified</Badge>
                                    {isConfirmingDiscard ? (
                                        <div className='flex items-center'>
                                            <span className='text-destructive mr-1 select-none'>
                                                Discard?
                                            </span>
                                            <Button
                                                variant='ghost'
                                                size='sm'
                                                tone='destructive'
                                                onClick={() => {
                                                    setDdlValue(resolved?.ddl || '');
                                                    setShowDiff(false);
                                                    setIsConfirmingDiscard(false);
                                                }}
                                                className='h-6 w-6 p-0 ui-interactive-ghost-destructive'
                                                title='Yes, discard changes'
                                            >
                                                <Check size={13} />
                                            </Button>
                                            <Button
                                                variant='ghost'
                                                size='sm'
                                                onClick={() => setIsConfirmingDiscard(false)}
                                                className='h-6 w-6 p-0 text-muted-foreground ui-interactive-surface'
                                                title='Cancel'
                                            >
                                                <X size={13} />
                                            </Button>
                                        </div>
                                    ) : (
                                        <Button
                                            variant='ghost'
                                            size='sm'
                                            tone='destructive'
                                            onClick={() => setIsConfirmingDiscard(true)}
                                            className='h-7 w-7 p-0 text-muted-foreground border border-border bg-muted/20 ui-interactive-surface'
                                            title='Discard changes'
                                        >
                                            <RotateCcw size={12} />
                                        </Button>
                                    )}
                                    <Button
                                        variant='ghost'
                                        size='sm'
                                        onClick={() => setShowDiff(prev => !prev)}
                                        className='h-7 w-7 p-0 border ui-interactive-ghost-primary border-primary/20'
                                        title={showDiff ? 'Show Editor' : 'Compare (Diff)'}
                                    >
                                        {showDiff ? <Code size={12} /> : <Eye size={12} />}
                                    </Button>
                                </div>
                            )}
                        </div>

                        {/* Full Height DDL Section */}
                        <section className='flex-1 flex flex-col min-h-0'>
                            <div className='flex-1 min-h-0 overflow-hidden'>
                                {showDiff ? (
                                    <DiffEditor
                                        original={resolved?.ddl || ''}
                                        modified={ddlValue}
                                        language='sql'
                                        theme={monacoTheme}
                                        options={{
                                            minimap: { enabled: false },
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            fontSize: 13,
                                            renderOverviewRuler: false,
                                            renderSideBySide: true,
                                        }}
                                    />
                                ) : (
                                    <Editor
                                        value={ddlValue}
                                        onChange={val => setDdlValue(val || '')}
                                        language='sql'
                                        theme={monacoTheme}
                                        options={{
                                            minimap: { enabled: false },
                                            scrollBeyondLastLine: false,
                                            automaticLayout: true,
                                            fontSize: 13,
                                            codeLens: false,
                                            editContext: false,
                                        }}
                                    />
                                )}
                            </div>
                        </section>
                    </>
                )}
            </div>
        </div>
    );
};
