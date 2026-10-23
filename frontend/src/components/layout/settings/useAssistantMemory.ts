// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from 'react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { kernelErrorMessage } from '../../../shared/kernel';
import type { AIMemoryNote } from '../../../lib/aiAssistant';

export interface AssistantMemoryModel {
    notes: AIMemoryNote[];
    busy: boolean;
    error: string;
    add: (text: string) => Promise<boolean>;
    remove: (id: string) => Promise<void>;
}

// useAssistantMemory lists the notes the assistant keeps for the open
// connection and lets the person add or delete them. It reloads when the
// connection changes, because notes belong to one connection.
export function useAssistantMemory(connectionId: string): AssistantMemoryModel {
    const [notes, setNotes] = useState<AIMemoryNote[]>([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!connectionId) {
            setNotes([]);
            return;
        }
        const response = await getApiGateway().ai.listMemoryNotes();
        if (!response.ok) {
            setError(kernelErrorMessage(response.error));
            return;
        }
        // Go encodes an empty list as null when it was never written.
        setNotes(response.data ?? []);
        setError('');
    }, [connectionId]);

    useEffect(() => {
        void load();
    }, [load]);

    const add = useCallback(
        async (text: string) => {
            setBusy(true);
            const response = await getApiGateway().ai.addMemoryNote(text);
            setBusy(false);
            if (!response.ok) {
                setError(kernelErrorMessage(response.error));
                return false;
            }
            await load();
            return true;
        },
        [load],
    );

    const remove = useCallback(
        async (id: string) => {
            setBusy(true);
            const response = await getApiGateway().ai.deleteMemoryNote(id);
            setBusy(false);
            if (!response.ok) {
                setError(kernelErrorMessage(response.error));
                return;
            }
            await load();
        },
        [load],
    );

    return { notes, busy, error, add, remove };
}
