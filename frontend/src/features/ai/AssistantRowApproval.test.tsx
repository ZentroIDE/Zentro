// SPDX-License-Identifier: GPL-3.0-only

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ApiGateway } from '../../platform/apiGateway';
import { resetApiGateway, setApiGateway } from '../../platform/apiGatewayRuntime';
import { useAIChatStore } from '../../stores/aiChatStore';
import { AssistantRowApproval } from './AssistantRowApproval';
import { AssistantSentRounds } from './AssistantSentRounds';

const approval = {
    requestId: 'req-1',
    round: 1,
    host: 'api.openai.com',
    loopback: false,
    env: 'pro',
    production: true,
    results: [
        {
            tool: 'run_readonly_query',
            label: 'Ran a query',
            rows: 1,
            content: JSON.stringify({
                ok: true,
                data: { columns: [{ name: 'status' }], rows: [['shipped']] },
            }),
        },
    ],
};

function gatewayWith(resolveChatApproval: ReturnType<typeof vi.fn>) {
    setApiGateway({ ai: { resolveChatApproval } } as unknown as ApiGateway);
}

describe('AssistantRowApproval', () => {
    afterEach(() => {
        resetApiGateway();
        useAIChatStore.setState({ approval: null });
    });

    it('shows the exact rows, the provider, and Production, then shares on Share', async () => {
        const resolveChatApproval = vi.fn(async () => ({ ok: true as const, data: undefined }));
        gatewayWith(resolveChatApproval);
        useAIChatStore.setState({ approval });
        render(<AssistantRowApproval />);

        expect(screen.getByText('Share 1 row with api.openai.com?')).toBeInTheDocument();
        expect(screen.getByText('shipped')).toBeInTheDocument();
        expect(screen.getByText('Production data')).toBeInTheDocument();

        fireEvent.click(screen.getByRole('button', { name: 'Share these rows' }));
        await waitFor(() => expect(resolveChatApproval).toHaveBeenCalledWith('req-1', true));
        expect(useAIChatStore.getState().approval).toBeNull();
    });

    it('answers no when the user does not share', async () => {
        const resolveChatApproval = vi.fn(async () => ({ ok: true as const, data: undefined }));
        gatewayWith(resolveChatApproval);
        useAIChatStore.setState({ approval });
        render(<AssistantRowApproval />);
        fireEvent.click(screen.getByRole('button', { name: /share$/i }));
        await waitFor(() => expect(resolveChatApproval).toHaveBeenCalledWith('req-1', false));
    });

    it('renders nothing without an approval', () => {
        const { container } = render(<AssistantRowApproval />);
        expect(container).toBeEmptyDOMElement();
    });
});

describe('AssistantSentRounds', () => {
    it('lists every request and opens its exact body', () => {
        render(
            <AssistantSentRounds
                rounds={[
                    {
                        round: 0,
                        host: 'api.openai.com',
                        bytes: 10,
                        body: 'first body',
                        carriesRows: false,
                    },
                    {
                        round: 1,
                        host: 'api.openai.com',
                        bytes: 20,
                        body: 'second body',
                        carriesRows: true,
                    },
                ]}
            />,
        );
        fireEvent.click(
            screen.getByRole('button', { name: /Sent to api.openai.com · 2 requests/ }),
        );
        fireEvent.click(screen.getByRole('button', { name: /Request 2 .* carried shared rows/ }));
        expect(screen.getByText('second body')).toBeInTheDocument();
        expect(screen.queryByText('first body')).toBeNull();
    });
});
