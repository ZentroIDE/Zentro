// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { Bug } from 'lucide-react';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { Button } from '../../ui';
import { showFeedbackPromptToast } from '../../../features/app-runtime/FeedbackPromptToast';

/** Dev-only section (see SettingsView's `import.meta.env.DEV` gate) for
 *  manually exercising flows that are otherwise gated behind real usage
 *  (e.g. the feedback prompt's 5-launch/once-ever gate). */
export const SettingsDebug: React.FC = () => {
    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={Bug}
                title='Debug'
                description='Dev-build-only tools for exercising gated flows without waiting on real triggers.'
            />
            <div className={SettingsClasses.sectionContent}>
                <div className='flex items-center justify-between gap-4'>
                    <div>
                        <p className='text-small text-foreground'>Feedback prompt</p>
                        <p className='text-label text-muted-foreground'>
                            Shows the "rate your experience" toast immediately, bypassing the
                            launch-count gate.
                        </p>
                    </div>
                    <Button
                        type='button'
                        variant='secondary'
                        size='sm'
                        onClick={() => showFeedbackPromptToast()}
                    >
                        Test feedback prompt
                    </Button>
                </div>
            </div>
        </div>
    );
};
