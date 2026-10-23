// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import {
    Button,
    Input,
    Label,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Switch,
} from '../../ui';

interface Props {
    canUseAppLock: boolean;
    appLockEnabled: boolean;
    appLockConfigured: boolean;
    appLockTimeoutSec: number;
    appLocked: boolean;
    onConfigureAppLock: (enabled: boolean, timeoutSec: number, pin: string) => Promise<void>;
    onLockNow: () => Promise<void>;
}

const TIMEOUT_OPTIONS = [
    { value: '60', label: '1 minute' },
    { value: '300', label: '5 minutes' },
    { value: '900', label: '15 minutes' },
    { value: '1800', label: '30 minutes' },
];

export const SettingsSecurity: React.FC<Props> = ({
    canUseAppLock,
    appLockEnabled,
    appLockConfigured,
    appLockTimeoutSec,
    appLocked,
    onConfigureAppLock,
    onLockNow,
}) => {
    const [timeoutSec, setTimeoutSec] = React.useState(String(appLockTimeoutSec || 300));
    const [pin, setPin] = React.useState('');
    const [appLockBusy, setAppLockBusy] = React.useState(false);

    React.useEffect(() => {
        setTimeoutSec(String(appLockTimeoutSec || 300));
    }, [appLockTimeoutSec]);

    const handleAppLockToggle = async (checked: boolean) => {
        setAppLockBusy(true);
        try {
            await onConfigureAppLock(checked, Number(timeoutSec), pin);
            setPin('');
        } finally {
            setAppLockBusy(false);
        }
    };

    const handleSaveTimeout = async () => {
        setAppLockBusy(true);
        try {
            await onConfigureAppLock(appLockEnabled, Number(timeoutSec), pin);
            setPin('');
        } finally {
            setAppLockBusy(false);
        }
    };

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={ShieldAlert}
                title='Security'
                description='Protect local access, saved credentials, and screen-shared query results.'
            />
            <div className={SettingsClasses.sectionContent}>
                <div className='rounded-md py-3'>
                    <div className='flex items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <div className='flex items-center gap-2 text-foreground'>
                                <span className='text-small font-semibold text-foreground'>
                                    App Lock
                                </span>
                                <span className='rounded-full ui-surface-primary-subtle px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-primary'>
                                    PRO
                                </span>
                            </div>
                            <p className='mt-1 text-label text-muted-foreground'>
                                Lock the workspace after idle time and require a PIN to resume.
                            </p>
                        </div>
                        <Switch
                            checked={appLockEnabled}
                            onCheckedChange={checked => {
                                void handleAppLockToggle(Boolean(checked));
                            }}
                            disabled={!canUseAppLock || appLockBusy}
                            aria-label='Enable app lock'
                        />
                    </div>
                    <div className='mt-3 flex flex-col flex-wrap gap-2'>
                        <div className=''>
                            <Label className='mb-1 text-muted-foreground'>Idle timeout</Label>
                            <Select
                                value={timeoutSec}
                                onValueChange={setTimeoutSec}
                                disabled={!canUseAppLock || appLockBusy}
                            >
                                <SelectTrigger variant='outline'>
                                    <SelectValue placeholder='Choose timeout' />
                                </SelectTrigger>
                                <SelectContent>
                                    {TIMEOUT_OPTIONS.map(option => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className='min-w-48 flex items-end flex-col justify-end'>
                            <div className='flex-1 w-full'>
                                <Label className='mb-1 text-muted-foreground'>
                                    {appLockConfigured ? 'Change PIN' : 'Set PIN'}
                                </Label>
                                <div className='flex gap-2 mt-2'>
                                    <Input
                                        type='password'
                                        value={pin}
                                        onChange={event => setPin(event.target.value)}
                                        placeholder={
                                            appLockConfigured
                                                ? 'Leave blank to keep current PIN'
                                                : 'Enter a PIN'
                                        }
                                        disabled={!canUseAppLock || appLockBusy}
                                    />
                                    <Button
                                        variant='outline'
                                        onClick={() => {
                                            void handleSaveTimeout();
                                        }}
                                        disabled={
                                            !canUseAppLock ||
                                            appLockBusy ||
                                            (!appLockEnabled && !pin.trim())
                                        }
                                    >
                                        Save
                                    </Button>
                                    <Button
                                        variant='ghost'
                                        onClick={() => {
                                            void onLockNow();
                                        }}
                                        disabled={
                                            !canUseAppLock ||
                                            !appLockEnabled ||
                                            !appLockConfigured ||
                                            appLocked
                                        }
                                    >
                                        Lock now
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </div>
                    {!canUseAppLock && (
                        <p className='mt-2 text-label text-muted-foreground'>
                            App Lock is available on Pro and Pro Early Access.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};
