// SPDX-License-Identifier: GPL-3.0-only

import React, { useEffect, useMemo, useState } from 'react';
import { MessageSquareWarning } from 'lucide-react';
import { BrowserOpenURL, Environment } from '../../../../wailsjs/runtime/runtime';
import { getApiGateway } from '../../../platform/apiGatewayRuntime';
import { buildIssueUrl } from '../../../lib/feedback/issueUrl';
import { SettingsClasses } from './SettingsStyles';
import { SettingsSectionHeader } from './SettingsSectionHeader';
import { SettingField } from './SettingItem';
import {
    Button,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Textarea,
} from '../../ui';

type FeedbackKind = 'feedback' | 'bug' | 'feature';

interface Props {
    environmentLabel: string;
}

interface AppDiagnosticInfo {
    version: string;
    commit: string;
    os: string;
    buildType: string;
}

// Filenames must match the issue forms under .github/ISSUE_TEMPLATE/ in the
// zentro-window-issue-tracker repo. Field ids below (app-version, os-info, ...)
// must match each form's field `id` so GitHub's query-param prefill lands in
// the right box: https://github.com/OWNER/REPO/issues/new?template=<file>&<id>=<value>
const FEEDBACK_KIND_META: Record<
    FeedbackKind,
    {
        label: string;
        defaultTitle: string;
        buttonText: string;
        helper: string;
        templateFile: string;
    }
> = {
    feedback: {
        label: 'feedback',
        defaultTitle: 'Product feedback',
        buttonText: 'Send Feedback',
        helper: 'Share UX pain points, rough edges, or ideas to improve day-to-day flow.',
        templateFile: 'feedback.yml',
    },
    bug: {
        label: 'bug',
        defaultTitle: 'Bug report',
        buttonText: 'Create Bug Issue',
        helper: 'Describe the problem, expected behavior, and exact steps to reproduce.',
        templateFile: 'bug_report.yml',
    },
    feature: {
        label: 'enhancement',
        defaultTitle: 'Feature request',
        buttonText: 'Create Feature Issue',
        helper: 'Describe what you want to add and why that change would help your workflow.',
        templateFile: 'feature_request.yml',
    },
};

export const SettingsFeedback: React.FC<Props> = ({ environmentLabel }) => {
    const [kind, setKind] = useState<FeedbackKind>('feedback');
    const [title, setTitle] = useState('');
    const [details, setDetails] = useState('');
    const [appInfo, setAppInfo] = useState<AppDiagnosticInfo | null>(null);
    const kindMeta = useMemo(() => FEEDBACK_KIND_META[kind], [kind]);

    useEffect(() => {
        let cancelled = false;
        void Promise.all([getApiGateway().settings.getAboutInfo(), Environment()])
            .then(([aboutResult, env]) => {
                if (cancelled || !aboutResult.ok) return;
                const about = aboutResult.data;
                setAppInfo({
                    version: about.version,
                    commit: about.commit,
                    os: about.os,
                    buildType: env.buildType,
                });
            })
            .catch(() => {
                // Diagnostic info is best-effort; the issue can still be filed without it.
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const handleOpenIssue = () => {
        const finalTitle = title.trim() || `${kindMeta.defaultTitle} (${environmentLabel})`;
        BrowserOpenURL(
            buildIssueUrl({
                template: kindMeta.templateFile,
                title: finalTitle,
                labels: kindMeta.label,
                description: details.trim() || '_No details provided yet._',
                'app-version': appInfo?.version || 'unknown',
                'build-commit': appInfo?.commit || 'unknown',
                'build-type': appInfo?.buildType || 'unknown',
                'os-info': appInfo?.os || 'unknown',
                environment: environmentLabel,
            }),
        );
    };

    return (
        <div className={SettingsClasses.section}>
            <SettingsSectionHeader
                icon={MessageSquareWarning}
                title='Feedback & Issue'
                description='Send feedback or open a GitHub issue with prefilled context.'
            />
            <div className={SettingsClasses.sectionContent}>
                <SettingField label='Type' helperText={kindMeta.helper}>
                    <Select value={kind} onValueChange={value => setKind(value as FeedbackKind)}>
                        <SelectTrigger variant='outline'>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value='feedback'>Feedback</SelectItem>
                            <SelectItem value='bug'>Bug</SelectItem>
                            <SelectItem value='feature'>Feature Request</SelectItem>
                        </SelectContent>
                    </Select>
                </SettingField>

                <SettingField
                    label='Title'
                    helperText='Leave blank to use an auto-generated title.'
                >
                    <Input
                        value={title}
                        onChange={e => setTitle(e.target.value)}
                        placeholder={kindMeta.defaultTitle}
                    />
                </SettingField>

                <SettingField label='Details'>
                    <Textarea
                        value={details}
                        onChange={e => setDetails(e.target.value)}
                        rows={5}
                        placeholder='What happened, what you expected, and any useful context...'
                    />
                </SettingField>

                <p className='text-label text-muted-foreground'>
                    Auto-attached:{' '}
                    {appInfo
                        ? `${appInfo.version} · ${appInfo.commit.slice(0, 7)} · ${appInfo.os}`
                        : 'loading build info...'}
                </p>

                <div className='flex flex-wrap items-center gap-2.5'>
                    <Button type='button' variant='outline' size='sm' onClick={handleOpenIssue}>
                        {kindMeta.buttonText}
                    </Button>
                </div>
            </div>
        </div>
    );
};
