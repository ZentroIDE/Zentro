// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Button } from '../../ui';
import { cn } from '../../../lib/cn';
import { PROJECT_COLOR_PALETTE } from '../../../lib/projectColors';

interface ProjectColorPickerProps {
    /** Selected palette key. */
    value: string;
    onSelect: (key: string) => void;
}

/**
 * Swatch row for the project identity color. New projects default to the
 * teal swatch (see DEFAULT_PROJECT_COLOR_KEY); there is no "auto" swatch.
 */
export const ProjectColorPicker: React.FC<ProjectColorPickerProps> = ({ value, onSelect }) => {
    return (
        <div className='flex flex-wrap items-center gap-1'>
            {PROJECT_COLOR_PALETTE.map(option => (
                <Button
                    key={option.key}
                    type='button'
                    variant='ghost'
                    size='icon'
                    className={cn('h-7 w-7', value === option.key && 'ring-2 ring-accent/60')}
                    title={option.label}
                    aria-label={`${option.label} project color`}
                    aria-pressed={value === option.key}
                    onClick={() => onSelect(option.key)}
                >
                    <span
                        className='h-4 w-4 rounded-full'
                        style={{ backgroundColor: option.value }}
                    />
                </Button>
            ))}
        </div>
    );
};
