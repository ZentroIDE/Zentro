// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { SquareTerminal } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingToggle } from './SettingItem';

interface Props {
    enabled: boolean;
    onEnabledChange: (val: boolean) => void;
}

export const SettingsTerminal: React.FC<Props> = ({ enabled, onEnabledChange }) => (
    <div className={SettingsClasses.section}>
        <SettingsSectionHeader
            icon={SquareTerminal}
            title='Terminal'
            description='A shell inside the bottom panel, on this machine or on the SSH server of a tunnelled connection.'
        />
        <div className={SettingsClasses.sectionContent}>
            <SettingToggle
                title='Enable terminal'
                description='Adds a Terminal tab to the bottom panel (Ctrl+`). A terminal runs commands with your user account’s full rights; turning this off closes every open shell.'
                checked={enabled}
                onCheckedChange={onEnabledChange}
            />
        </div>
    </div>
);
