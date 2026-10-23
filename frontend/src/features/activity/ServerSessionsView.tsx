// SPDX-License-Identifier: GPL-3.0-only

import React, { useState } from 'react';
import { Copy, MoreHorizontal } from 'lucide-react';
import {
    Badge,
    Button,
    DataEmpty,
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    Input,
} from '../../components/ui';
import type { ServerSession } from '../../platform/app-api/contracts/serverSession';
import { formatElapsed } from './useElapsed';
import type { ServerSessionsController } from './useServerSessionsController';

const COLUMN_HEADER_CLASS =
    'grid grid-cols-[64px_100px_100px_150px_90px_80px_minmax(0,1fr)_32px] gap-3 border-b border-border px-3 py-1.5 text-label font-semibold uppercase tracking-wide text-muted-foreground';

interface KillSessionDialogProps {
    session: ServerSession | null;
    force: boolean;
    isProduction: boolean;
    confirming: boolean;
    onCancel: () => void;
    onConfirm: () => void;
}

/** Kill/cancel confirmation for a server session. In a production
 *  environment (ADR-0008's environment safety policy), the user must type
 *  the session id to confirm, matching the destructive-action pattern used
 *  elsewhere for production writes — a plain yes/no is too easy to click
 *  through for an action that rolls back someone else's transaction. */
function KillSessionDialog({
    session,
    force,
    isProduction,
    confirming,
    onCancel,
    onConfirm,
}: KillSessionDialogProps) {
    const [typedId, setTypedId] = useState('');

    React.useEffect(() => {
        setTypedId('');
    }, [session]);

    const requiresTyping = isProduction && force;
    const canConfirm = !requiresTyping || typedId.trim() === session?.id;

    return (
        <Dialog open={session !== null} onOpenChange={next => !next && onCancel()}>
            <DialogContent size='sm'>
                <DialogHeader>
                    <DialogTitle>
                        {force ? 'Terminate session' : 'Cancel the running statement'} {session?.id}
                        ?
                    </DialogTitle>
                </DialogHeader>
                <div className='px-4 py-3 flex flex-col gap-2'>
                    <p className='text-small'>
                        {force
                            ? 'This ends the session entirely. Its open transaction, if any, is rolled back.'
                            : 'This interrupts the current statement only — the session stays open.'}
                    </p>
                    {session?.query && (
                        <p className='text-label text-muted-foreground font-mono truncate'>
                            {session.query}
                        </p>
                    )}
                    {requiresTyping && (
                        <div className='flex flex-col gap-1 mt-1'>
                            <label
                                className='text-label text-muted-foreground'
                                htmlFor='kill-session-confirm-id'
                            >
                                Type{' '}
                                <span className='font-mono text-foreground'>{session?.id}</span> to
                                confirm — this is a production environment.
                            </label>
                            <Input
                                id='kill-session-confirm-id'
                                value={typedId}
                                onChange={e => setTypedId(e.target.value)}
                                placeholder={session?.id}
                                autoFocus
                            />
                        </div>
                    )}
                </div>
                <DialogFooter>
                    <Button variant='ghost' onClick={onCancel} disabled={confirming}>
                        Cancel
                    </Button>
                    <Button
                        variant='destructive'
                        onClick={onConfirm}
                        disabled={confirming || !canConfirm}
                        state={confirming ? 'loading' : 'default'}
                    >
                        {force ? 'Terminate' : 'Cancel statement'}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

type ServerSessionsViewProps = Pick<
    ServerSessionsController,
    | 'filtered'
    | 'error'
    | 'supported'
    | 'killAction'
    | 'acting'
    | 'isProduction'
    | 'handleConfirmKill'
>;

/** Sessions tab's content — the session list and its kill/cancel confirm
 *  dialog. The filter/interval/refresh toolbar lives in ActivityPanel's
 *  shared tab row (see ServerSessionsToolbar), fed by the same
 *  useServerSessionsController instance as this component. */
export function ServerSessionsView({
    filtered,
    error,
    supported,
    killAction,
    acting,
    isProduction,
    handleConfirmKill,
}: ServerSessionsViewProps) {
    if (!supported) {
        return (
            <div className='flex flex-1 items-center justify-center'>
                <DataEmpty
                    title='Not supported for this driver'
                    description={error || 'Server session listing is not available for SQLite.'}
                />
            </div>
        );
    }

    return (
        <div className='flex h-full min-h-0 flex-col'>
            {filtered.length === 0 ? (
                <div className='flex flex-1 items-center justify-center'>
                    <DataEmpty
                        title='No sessions'
                        description={error || 'No sessions match this filter right now.'}
                    />
                </div>
            ) : (
                <>
                    <div className={COLUMN_HEADER_CLASS}>
                        <span>PID</span>
                        <span>User</span>
                        <span>DB</span>
                        <span>Client</span>
                        <span>State</span>
                        <span>Duration</span>
                        <span>Query</span>
                        <span />
                    </div>
                    <div className='flex-1 min-h-0 overflow-auto'>
                        {filtered.map(session => (
                            <div
                                key={session.id}
                                className='grid grid-cols-[64px_100px_100px_150px_90px_80px_minmax(0,1fr)_32px] items-center gap-3 border-b border-border/60 last:border-b-0 px-3 py-2 text-small'
                            >
                                <span className='font-mono text-foreground truncate flex items-center gap-1'>
                                    {session.id}
                                    {session.isSelf && (
                                        <span title='This is Zentro' className='text-warning'>
                                            ★
                                        </span>
                                    )}
                                </span>
                                <span className='truncate text-muted-foreground'>
                                    {session.user}
                                </span>
                                <span className='truncate text-muted-foreground'>
                                    {session.database}
                                </span>
                                <span className='truncate text-muted-foreground font-mono'>
                                    {session.client}
                                </span>
                                <Badge variant='muted' className='w-fit'>
                                    {session.state || '—'}
                                </Badge>
                                <span className='font-mono text-muted-foreground'>
                                    {formatElapsed(session.durationMs)}
                                </span>
                                <span
                                    className='truncate font-mono text-muted-foreground'
                                    title={session.query}
                                >
                                    {session.wait ? `[${session.wait}] ` : ''}
                                    {session.query || '—'}
                                </span>
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button
                                            variant='ghost'
                                            size='icon'
                                            className='h-6! w-6!'
                                            aria-label={`Actions for session ${session.id}`}
                                        >
                                            <MoreHorizontal size={14} />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align='end'>
                                        <DropdownMenuItem
                                            onSelect={() => {
                                                void navigator.clipboard.writeText(session.query);
                                            }}
                                        >
                                            <Copy size={12} />
                                            Copy query
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={session.isSelf}
                                            onSelect={() =>
                                                killAction.request({ session, force: false })
                                            }
                                        >
                                            Cancel query
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            disabled={session.isSelf}
                                            danger
                                            onSelect={() =>
                                                killAction.request({ session, force: true })
                                            }
                                        >
                                            Kill session
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>
                        ))}
                    </div>
                </>
            )}

            <KillSessionDialog
                session={killAction.pending?.session ?? null}
                force={killAction.pending?.force ?? false}
                isProduction={isProduction}
                confirming={acting}
                onCancel={killAction.cancel}
                onConfirm={() => {
                    void killAction.confirm(handleConfirmKill);
                }}
            />
        </div>
    );
}
