// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';

interface Props {
    icon: LucideIcon;
    title: string;
    description: string;
}

export const SettingsSectionHeader: React.FC<Props> = ({ icon: Icon, title, description }) => (
    <div className={SettingsClasses.sectionInfo}>
        <div className='flex items-center gap-2.5 text-accent mb-1'>
            <Icon size={18} strokeWidth={2.5} />
            <h2 className={SettingsClasses.sectionTitle}>{title}</h2>
        </div>
        <p className={SettingsClasses.sectionDescription}>{description}</p>
    </div>
);
