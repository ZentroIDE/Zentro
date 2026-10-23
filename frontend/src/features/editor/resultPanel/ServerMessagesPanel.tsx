// SPDX-License-Identifier: GPL-3.0-only

interface ServerMessagesPanelProps {
    messages: string[];
}

// Server-side informational output (T-SQL PRINT / low-severity RAISERROR)
// for a query tab's latest run, in the order the server emitted it.
export function ServerMessagesPanel({ messages }: ServerMessagesPanelProps) {
    return (
        <div className='w-full h-full overflow-auto bg-card select-text p-2'>
            <pre className='m-0 font-mono text-label whitespace-pre-wrap break-all leading-relaxed text-foreground select-text'>
                {messages.join('\n')}
            </pre>
        </div>
    );
}
