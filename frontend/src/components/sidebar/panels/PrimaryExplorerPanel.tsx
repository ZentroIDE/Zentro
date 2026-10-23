// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { RefreshCw, WifiOff } from 'lucide-react';
import { useConnectionStore } from '../../../stores/connectionStore';
import { CONNECTION_STATUS } from '../../../lib/constants';
import { DatabaseExplorer } from '../../../features/connection/DatabaseExplorer';
import { Button, Spinner } from '../../ui';
import { useReconnectLogic } from '@/components/layout/toolbar/useReconnectLogic';

export const PrimaryExplorerPanel: React.FC = () => {
    const isConnected = useConnectionStore(state => state.isConnected);
    const { handleReconnect, canReconnect, isConnecting } = useReconnectLogic();

    const connectionStatus = useConnectionStore(state => state.connectionStatus);

    if (isConnected) {
        return <DatabaseExplorer />;
    }

    if (isConnecting) {
        return (
            <div className='flex h-full flex-col items-center justify-center gap-2 px-4 text-center'>
                <Spinner size={16} />
                <p className='text-label text-muted-foreground'>Connecting…</p>
            </div>
        );
    }

    const isError = connectionStatus === CONNECTION_STATUS.ERROR;

    return (
        <div className='flex h-full flex-col items-center justify-center gap-4 px-6 text-center'>
            <div className='flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-muted-foreground'>
                <WifiOff size={15} />
            </div>
            <div className='space-y-1'>
                <p className='text-small font-semibold text-foreground'>
                    {isError ? 'Connection failed' : 'Not connected'}
                </p>
                <p className='text-label text-muted-foreground'>
                    {isError
                        ? 'Could not reach the database. Check your settings or network.'
                        : 'Select an environment and connect to a database.'}
                </p>
            </div>
            <Button
                variant='default'
                size='sm'
                title='Reload Connection'
                onClick={() => {
                    void handleReconnect();
                }}
                disabled={!canReconnect}
            >
                <RefreshCw size={14} />
                Reload
            </Button>
        </div>
    );
};
