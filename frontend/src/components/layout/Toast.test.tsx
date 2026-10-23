// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './Toast';
import { useNotificationStore } from '../../stores/notificationStore';

const { sonnerToastMock, sonnerDismissMock } = vi.hoisted(() => ({
    sonnerToastMock: vi.fn(),
    sonnerDismissMock: vi.fn(),
}));

vi.mock('sonner', () => ({
    toast: Object.assign(sonnerToastMock, {
        custom: sonnerToastMock,
        dismiss: sonnerDismissMock,
    }),
    Toaster: () => null,
}));

const Probe: React.FC<{
    run: (toast: ReturnType<typeof useToast>['toast']) => void;
}> = ({ run }) => {
    const { toast } = useToast();

    React.useEffect(() => {
        run(toast);
    }, [run, toast]);

    return null;
};

describe('ToastProvider', () => {
    beforeEach(() => {
        sonnerToastMock.mockReset();
        sonnerDismissMock.mockReset();
        useNotificationStore.setState({ entries: [], unreadCount: 0 });
    });

    it('keeps regular toast notifications out of the inbox', () => {
        render(
            <ToastProvider>
                <Probe run={toast => toast.success('Saved successfully')} />
            </ToastProvider>,
        );

        expect(sonnerToastMock).toHaveBeenCalledTimes(1);
        expect(useNotificationStore.getState().entries).toHaveLength(0);
    });

    it('records important error notifications while still showing toast', () => {
        const retryConnection = vi.fn();

        render(
            <ToastProvider>
                <Probe
                    run={toast =>
                        toast.error('Connection lost', {
                            important: true,
                            source: 'system.connection',
                            dedupeKey: 'connection-error',
                            actions: [
                                {
                                    id: 'retry',
                                    label: 'Retry',
                                    run: retryConnection,
                                },
                            ],
                        })
                    }
                />
            </ToastProvider>,
        );

        expect(sonnerToastMock).toHaveBeenCalledTimes(1);
        expect(useNotificationStore.getState().entries).toHaveLength(1);
        expect(useNotificationStore.getState().entries[0]).toMatchObject({
            message: 'Connection lost',
            source: 'system.connection',
            dedupeKey: 'connection-error',
            read: false,
        });
        expect(useNotificationStore.getState().entries[0].actions).toEqual([
            expect.objectContaining({
                id: 'retry',
                label: 'Retry',
                run: retryConnection,
            }),
        ]);
    });

    it('dedupes repeated important notifications by key', () => {
        render(
            <ToastProvider>
                <Probe
                    run={toast => {
                        toast.error('First error', {
                            important: true,
                            source: 'system.connection',
                            dedupeKey: 'connection-error',
                        });
                        toast.error('Latest error', {
                            important: true,
                            source: 'system.connection',
                            dedupeKey: 'connection-error',
                        });
                    }}
                />
            </ToastProvider>,
        );

        const state = useNotificationStore.getState();
        expect(state.entries).toHaveLength(1);
        expect(state.entries[0].message).toBe('Latest error');
        expect(sonnerToastMock).toHaveBeenCalledTimes(2);
    });

    it('renders toast actions and runs them from the custom body', () => {
        const openFile = vi.fn();

        render(
            <ToastProvider>
                <Probe
                    run={toast =>
                        toast.success('Exported to file', {
                            actions: [
                                {
                                    id: 'open-file',
                                    label: 'Open file',
                                    run: openFile,
                                },
                            ],
                        })
                    }
                />
            </ToastProvider>,
        );

        const renderer = sonnerToastMock.mock.calls[0]?.[0] as (
            id: string | number,
        ) => React.ReactNode;
        render(<>{renderer('toast-1')}</>);

        fireEvent.click(screen.getByRole('button', { name: 'Open file' }));

        expect(openFile).toHaveBeenCalledTimes(1);
        expect(sonnerDismissMock).toHaveBeenCalledWith('toast-1');
    });
});
