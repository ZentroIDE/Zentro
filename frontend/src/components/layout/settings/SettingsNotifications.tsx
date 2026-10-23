// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Bell } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField } from './SettingItem';
import type { ToastPlacement } from '../Toast';
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui';

interface Props {
    toastPlacement: ToastPlacement;
    onToastPlacementChange: (val: ToastPlacement) => void;
    onTestNotification: (variant: 'success' | 'error' | 'info') => void;
}

export const SettingsNotifications: React.FC<Props> = ({
    toastPlacement,
    onToastPlacementChange,
    onTestNotification,
}) => {
    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Bell}
                title='Notifications'
                description='Configure how and where system alerts appear.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingField
                    label='Alert Placement'
                    helperText='Where success and error messages will emerge.'
                >
                    <Select
                        value={toastPlacement}
                        onValueChange={value => onToastPlacementChange(value as ToastPlacement)}
                    >
                        <SelectTrigger variant='outline'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='bottom-left'>Bottom Left</SelectItem>
                            <SelectItem value='bottom-center'>Bottom Center</SelectItem>
                            <SelectItem value='bottom-right'>Bottom Right</SelectItem>
                            <SelectItem value='top-left'>Top Left</SelectItem>
                            <SelectItem value='top-center'>Top Center</SelectItem>
                            <SelectItem value='top-right'>Top Right</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingField>
                <SettingField
                    label='Preview Notification'
                    helperText='Send a sample toast to verify placement and style.'
                >
                    <div className='flex flex-wrap items-center gap-2'>
                        <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            tone={'success'}
                            onClick={() => onTestNotification('success')}
                        >
                            Test Success
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            tone={'destructive'}
                            onClick={() => onTestNotification('error')}
                        >
                            Test Error
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='ghost'
                            tone={'neutral'}
                            onClick={() => onTestNotification('info')}
                        >
                            Test Info
                        </Button>
                    </div>
                </SettingField>
            </div>
        </div>
    );
};
