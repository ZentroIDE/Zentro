// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it, vi } from 'vitest';
import { ENVIRONMENT_KEY } from '../../lib/constants';

const projectGatewayMock = vi.hoisted(() => ({
    getActiveProject: vi.fn(),
}));

vi.mock('../../platform/apiGatewayRuntime', () => ({
    getApiGateway: () => ({ project: projectGatewayMock }),
}));

import { getActiveProject } from './projectGateway';

describe('getActiveProject', () => {
    it('returns null without throwing when no project is active yet', async () => {
        // A freshly started process (e.g. a spawned "open in new window")
        // reports ok:true with data:null before any project is opened.
        projectGatewayMock.getActiveProject.mockResolvedValue({ ok: true, data: null });

        await expect(getActiveProject()).resolves.toBeNull();
    });

    it('maps a present active project', async () => {
        projectGatewayMock.getActiveProject.mockResolvedValue({
            ok: true,
            data: {
                id: 'p1',
                slug: 'project-1',
                name: 'Project 1',
                default_environment_key: ENVIRONMENT_KEY.DEVELOPMENT,
                environments: [],
                connections: [],
                assets: [],
            },
        });

        const project = await getActiveProject();
        expect(project?.id).toBe('p1');
    });

    it('returns null when the gateway call fails', async () => {
        projectGatewayMock.getActiveProject.mockResolvedValue({
            ok: false,
            error: { code: 'x', message: 'boom' },
        });

        await expect(getActiveProject()).resolves.toBeNull();
    });
});
