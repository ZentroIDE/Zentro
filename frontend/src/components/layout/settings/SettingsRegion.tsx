// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Globe } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField } from './SettingItem';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui';

export const SettingsRegion: React.FC = () => {
    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Globe}
                title='Regional Settings'
                description='Locality and language preferences.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingField
                    label='Preferred Language'
                    helperText='Zentro is currently optimized for English.'
                >
                    <Select value='en' disabled>
                        <SelectTrigger variant='outline'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='en'>English (United States)</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingField>
            </div>
        </div>
    );
};
