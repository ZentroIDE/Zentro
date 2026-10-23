// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { AssistantReview, SensitiveNotice } from './AssistantReview';
import type { AIPreview } from '../../lib/aiAssistant';

describe('SensitiveNotice', () => {
    it('names what was found, where, and shows the text around it', () => {
        const onKeep = vi.fn();
        render(
            <SensitiveNotice
                busy={false}
                onKeep={onKeep}
                matches={[
                    {
                        type: 'phone',
                        sample: '091...78',
                        where: 'an earlier reply in this chat',
                        context: '…call the supplier at 0912 345 678 before Friday…',
                    },
                ]}
            />,
        );
        expect(
            screen.getByText('Phone number in an earlier reply in this chat'),
        ).toBeInTheDocument();
        expect(
            screen.getByText('…call the supplier at 0912 345 678 before Friday…'),
        ).toBeInTheDocument();
        fireEvent.click(screen.getByRole('button', { name: 'Send anyway' }));
        expect(onKeep).toHaveBeenCalled();
    });

    it('falls back to the masked sample when there is no context', () => {
        render(
            <SensitiveNotice
                busy={false}
                onKeep={() => undefined}
                matches={[{ type: 'email', sample: 'bob...om' }]}
            />,
        );
        expect(screen.getByText('Email address')).toBeInTheDocument();
        expect(screen.getByText('bob...om')).toBeInTheDocument();
    });
});

describe('AssistantReview', () => {
    const review: AIPreview = {
        host: 'api.deepseek.com',
        model: 'deepseek-chat',
        body: '{}',
        data: 'Tables in this schema',
        estimatedTokens: 10,
        historyTurns: 2,
        sendToken: 't',
        held: false,
        holdReason: '',
        matches: [],
        loopback: false,
        granted: false,
    };

    it('offers to allow for the whole project and shows no token estimate', () => {
        const onAllowProject = vi.fn();
        render(
            <AssistantReview
                review={review}
                providerLabel='DeepSeek'
                busy={false}
                onAllowChat={() => undefined}
                onAllowProject={onAllowProject}
                onAllowHost={() => undefined}
                onKeepSensitive={() => undefined}
                matches={[]}
                holdReason=''
            />,
        );
        expect(screen.queryByText(/tokens/)).toBeNull();
        fireEvent.click(screen.getByRole('button', { name: 'Allow for this project' }));
        expect(onAllowProject).toHaveBeenCalled();
    });
});
