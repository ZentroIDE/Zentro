// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Activity } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField, SettingToggle } from './SettingItem';
import { Button } from '../../ui';
import { STATS_INTERVAL_OPTIONS, type StatsIntervalMs } from '../../../stores/statusBarStatsStore';

interface Props {
    enabled: boolean;
    onEnabledChange: (val: boolean) => void;
    showLatency: boolean;
    onShowLatencyChange: (val: boolean) => void;
    showNetwork: boolean;
    onShowNetworkChange: (val: boolean) => void;
    showResources: boolean;
    onShowResourcesChange: (val: boolean) => void;
    intervalMs: StatsIntervalMs;
    onIntervalMsChange: (val: StatsIntervalMs) => void;
}

export const SettingsStatusBar: React.FC<Props> = ({
    enabled,
    onEnabledChange,
    showLatency,
    onShowLatencyChange,
    showNetwork,
    onShowNetworkChange,
    showResources,
    onShowResourcesChange,
    intervalMs,
    onIntervalMsChange,
}) => (
    <div className={SettingsClasses.section}>
        <SettingsSectionHeader
            icon={Activity}
            title='Status Bar'
            description='Live numbers shown at the bottom of the window while you work.'
        />
        <div className={SettingsClasses.sectionContent}>
            <SettingToggle
                title='Show live stats'
                description='Sample database latency, traffic and resource use. Turning this off stops the sampler entirely.'
                checked={enabled}
                onCheckedChange={onEnabledChange}
            />
            <SettingToggle
                title='Database latency'
                description='Round trip of a ping to the connected server, so a slow VPN or tunnel is visible at a glance.'
                checked={showLatency}
                onCheckedChange={onShowLatencyChange}
                disabled={!enabled}
            />
            <SettingToggle
                title='Network traffic'
                description="Download and upload of Zentro's own database connections (not the whole machine)."
                checked={showNetwork}
                onCheckedChange={onShowNetworkChange}
                disabled={!enabled}
            />
            <SettingToggle
                title='CPU and memory'
                description='What Zentro uses of this machine, including the UI renderer processes on Windows.'
                checked={showResources}
                onCheckedChange={onShowResourcesChange}
                disabled={!enabled}
            />
            <SettingField
                label='Refresh interval'
                helperText='How often the numbers update. Longer is lighter on the database and the machine.'
            >
                <div className='flex flex-wrap items-center gap-2'>
                    {STATS_INTERVAL_OPTIONS.map(option => (
                        <Button
                            key={option}
                            type='button'
                            size='sm'
                            variant={intervalMs === option ? 'default' : 'outline'}
                            aria-pressed={intervalMs === option}
                            disabled={!enabled}
                            onClick={() => onIntervalMsChange(option)}
                        >
                            {option / 1000}s
                        </Button>
                    ))}
                </div>
            </SettingField>
        </div>
    </div>
);
