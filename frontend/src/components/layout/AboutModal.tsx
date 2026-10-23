// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useMemo, useState } from 'react';
import { Check, Copy } from 'lucide-react';
import { Button, Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui';
import appIcon from '../../assets/images/appicon.png';
import { getApiGateway } from '../../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../../shared/kernel';
import type { app } from '../../../wailsjs/go/models';
import { Environment } from '../../../wailsjs/runtime/runtime';

interface AboutModalProps {
    onClose: () => void;
}

export const AboutModal: React.FC<AboutModalProps> = ({ onClose }) => {
    const [aboutInfo, setAboutInfo] = useState<app.AboutInfo | null>(null);
    const [runtimeEnv, setRuntimeEnv] = useState<{
        buildType: string;
        platform: string;
        arch: string;
    } | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            try {
                const [infoResult, env] = await Promise.all([
                    getApiGateway().settings.getAboutInfo(),
                    Environment(),
                ]);
                const info = unwrapOrThrow(infoResult);
                if (cancelled) {
                    return;
                }
                setAboutInfo(info);
                setRuntimeEnv(env);
                setLoadError(null);
            } catch (error) {
                if (cancelled) {
                    return;
                }
                console.error('Failed to load about info', error);
                setLoadError('Unable to load build info');
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };

        void load();
        return () => {
            cancelled = true;
        };
    }, []);

    const dateWithRelative = useMemo(() => {
        const raw = aboutInfo?.date?.trim();
        if (!raw || raw === 'unknown') {
            return 'unknown';
        }

        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) {
            return raw;
        }

        const diffDays = Math.max(
            0,
            Math.floor((Date.now() - parsed.getTime()) / (24 * 60 * 60 * 1000)),
        );
        const dayText = diffDays === 1 ? '1 day ago' : `${diffDays} days ago`;
        return `${raw} (${dayText})`;
    }, [aboutInfo?.date]);

    const osValue = useMemo(() => {
        const platform = runtimeEnv?.platform || '';
        const arch = runtimeEnv?.arch || '';
        if (platform && arch) {
            return `${platform} ${arch}`;
        }
        return aboutInfo?.os || 'unknown';
    }, [aboutInfo?.os, runtimeEnv?.arch, runtimeEnv?.platform]);

    const commitValue = useMemo(() => {
        const raw = aboutInfo?.commit?.trim();
        if (!raw) {
            return 'unknown';
        }
        // Only abbreviate real SHAs; slicing the "unknown" placeholder gave "unknow".
        return /^[0-9a-f]{12,}$/i.test(raw) ? raw.slice(0, 7) : raw;
    }, [aboutInfo?.commit]);

    const infoRows = useMemo(
        () =>
            [
                { label: 'Version', value: aboutInfo?.version || 'unknown' },
                { label: 'Commit', value: commitValue },
                { label: 'Date', value: dateWithRelative },
                { label: 'OS', value: osValue },
                { label: 'Channel', value: aboutInfo?.channel || 'stable' },
            ] as const,
        [aboutInfo?.channel, aboutInfo?.version, commitValue, dateWithRelative, osValue],
    );

    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        const text = infoRows.map(row => `${row.label}: ${row.value}`).join('\n');
        try {
            await navigator.clipboard.writeText(text);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy info', err);
        }
    };

    return (
        <Dialog open onOpenChange={v => !v && onClose()}>
            <DialogContent
                className='p-0 max-w-140 max-h-[90vh] overflow-hidden'
                style={{ '--wails-draggable': 'no-drag' } as React.CSSProperties}
                onDoubleClick={e => e.stopPropagation()}
            >
                <DialogHeader>
                    <DialogTitle>About Zentro</DialogTitle>
                </DialogHeader>
                <div className='px-4 py-3 overflow-y-auto'>
                    <div className='pb-4 pt-2'>
                        <div className='flex gap-3'>
                            <div className='flex flex-col gap-1.5'>
                                <div className='h-42 w-42 overflow-hidden rounded-md bg-background/60 p-2'>
                                    <img
                                        src={appIcon}
                                        alt='Zentro App Icon'
                                        className='h-full w-full object-contain'
                                    />
                                </div>
                                <Button variant='ghost' onClick={handleCopy} className='gap-1.5'>
                                    {copied ? (
                                        <>
                                            <Check size={13} className='text-success' />
                                            Copied
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={13} />
                                            Copy Info
                                        </>
                                    )}
                                </Button>
                            </div>

                            <div className='min-w-0 flex-1 rounded-md bg-background/60'>
                                {loading && (
                                    <div className='px-3 py-2 text-small text-muted-foreground'>
                                        Loading build information...
                                    </div>
                                )}
                                {!loading && loadError && (
                                    <div className='px-3 py-2 text-small text-destructive'>
                                        {loadError}
                                    </div>
                                )}
                                {!loading &&
                                    infoRows.map((row, index) => (
                                        <div
                                            key={row.label}
                                            className='grid grid-cols-[120px_1fr] gap-2 px-3 py-1.5 text-small leading-relaxed even:bg-muted/20'
                                        >
                                            <span className='font-medium text-foreground'>
                                                {row.label}:
                                            </span>
                                            <span
                                                className={
                                                    index === 1
                                                        ? 'break-all text-foreground'
                                                        : 'text-foreground'
                                                }
                                                title={row.value}
                                            >
                                                {row.value}
                                            </span>
                                        </div>
                                    ))}
                            </div>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};
