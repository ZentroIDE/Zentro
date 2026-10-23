// SPDX-License-Identifier: GPL-3.0-only

import { useCallback, useEffect, useState } from 'react';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { kernelErrorMessage, type KernelResult } from '../../../shared/kernel';
import type { AIMCPClient, AIMCPStatus } from '../../../lib/aiAssistant';

// MCPServerSettingsModel is what the MCP settings rows show and can do. The
// component that draws them only reads this; it does not call the backend.
export interface MCPServerSettingsModel {
    status: AIMCPStatus | null;
    busy: boolean;
    error: string;
    message: string;
    setRunning: (on: boolean) => void;
    setAutoStart: (on: boolean) => void;
    connect: (client: AIMCPClient) => void;
    disconnect: (client: AIMCPClient) => void;
    rotateToken: () => void;
}

// useMCPServerSettings owns the MCP server state for System Settings: it reads
// the status once and runs each action through the API gateway.
export function useMCPServerSettings(): MCPServerSettingsModel {
    const [status, setStatus] = useState<AIMCPStatus | null>(null);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        const response = await getApiGateway().ai.getMCPStatus();
        if (response.ok) setStatus(response.data);
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    // run calls the backend and keeps its error for the rows to show.
    const run = useCallback(async <T>(call: () => Promise<KernelResult<T>>) => {
        setBusy(true);
        setError('');
        setMessage('');
        const response = await call();
        setBusy(false);
        if (!response.ok) {
            setError(kernelErrorMessage(response.error));
            return null;
        }
        return response.data;
    }, []);

    const setRunning = useCallback(
        async (on: boolean) => {
            const next = await run(() =>
                on ? getApiGateway().ai.startMCPServer() : getApiGateway().ai.stopMCPServer(),
            );
            if (next) setStatus(next);
        },
        [run],
    );

    const setAutoStart = useCallback(
        async (on: boolean) => {
            const next = await run(() => getApiGateway().ai.setMCPAutoStart(on));
            if (next) setStatus(next);
        },
        [run],
    );

    const connect = useCallback(
        async (client: AIMCPClient) => {
            const result = await run(() => getApiGateway().ai.connectMCPClient(client));
            if (result) setMessage(result.message);
            await refresh();
        },
        [refresh, run],
    );

    const disconnect = useCallback(
        async (client: AIMCPClient) => {
            const result = await run(() => getApiGateway().ai.disconnectMCPClient(client));
            if (result) setMessage(result.message);
            await refresh();
        },
        [refresh, run],
    );

    const rotateToken = useCallback(async () => {
        const next = await run(() => getApiGateway().ai.rotateMCPToken());
        if (next) {
            setStatus(next);
            setMessage('New token made. Connect each agent again so it uses the new token.');
        }
    }, [run]);

    return {
        status,
        busy,
        error,
        message,
        setRunning: on => void setRunning(on),
        setAutoStart: on => void setAutoStart(on),
        connect: client => void connect(client),
        disconnect: client => void disconnect(client),
        rotateToken: () => void rotateToken(),
    };
}
