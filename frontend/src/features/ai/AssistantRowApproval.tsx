// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import {
    Badge,
    Button,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '../../components/ui';
import { useAIChatStore } from '../../stores/aiChatStore';
import { approvalRowCount, approvalTables } from './rowApproval';

// AssistantRowApproval shows the rows a reply wants to send to the model and
// waits for the user. Nothing is sent until Share is pressed; closing the
// dialog counts as no (ADR 0017).
export function AssistantRowApproval() {
    const approval = useAIChatStore(state => state.approval);
    const answer = useAIChatStore(state => state.answerApproval);
    if (!approval) return null;

    const tables = approvalTables(approval.results);
    const count = approvalRowCount(approval.results);
    const destination = approval.loopback ? 'the model on this computer' : approval.host;

    return (
        <Dialog
            open
            onOpenChange={open => {
                if (!open) void answer(false);
            }}
        >
            <DialogContent size='lg'>
                <DialogHeader>
                    <DialogTitle>
                        Share {count} row{count === 1 ? '' : 's'} with {destination}?
                    </DialogTitle>
                    <DialogDescription>
                        {approval.loopback
                            ? 'These rows come from Production. They stay on this computer, but Zentro asks before any Production rows reach a model.'
                            : `These exact rows will be sent to ${approval.host}, and stay in this conversation for the rest of the reply. The provider's own terms apply to them.`}
                    </DialogDescription>
                </DialogHeader>
                <div className='flex items-center gap-2'>
                    <Badge variant={approval.production ? 'destructive' : 'muted'}>
                        {approval.env || 'environment'}
                    </Badge>
                    {approval.production && (
                        <span className='text-label text-destructive'>Production data</span>
                    )}
                </div>
                <div className='flex max-h-80 flex-col gap-3 overflow-auto'>
                    {tables.map((table, index) => (
                        <div key={index} className='flex flex-col gap-1'>
                            <p className='text-label text-muted-foreground'>{table.title}</p>
                            {table.raw !== undefined ? (
                                <pre className='overflow-auto rounded-md bg-muted p-2 text-label'>
                                    {table.raw}
                                </pre>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            {table.columns.map((column, i) => (
                                                <TableHead key={i}>{column}</TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {table.rows.map((row, r) => (
                                            <TableRow key={r}>
                                                {row.map((cell, c) => (
                                                    <TableCell key={c}>{cell}</TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </div>
                    ))}
                </div>
                <DialogFooter>
                    <Button type='button' variant='outline' onClick={() => void answer(false)}>
                        Don&apos;t share
                    </Button>
                    <Button type='button' onClick={() => void answer(true)}>
                        Share these rows
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
