// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { models } from '../../wailsjs/go/models';
import { useScriptStore, resolveScriptSaveTarget } from './scriptStore';
import { resetApiGateway, setApiGateway } from '../platform/apiGatewayRuntime';
import type { ApiGateway } from '../platform/apiGateway';

const PROJECT_ID = 'project-1';
const CONNECTION = 'conn-1';

function makeScript(id: string, name: string, updatedAt = '2026-01-01T00:00:00.000Z') {
    return models.SavedScript.createFrom({
        id,
        project_id: PROJECT_ID,
        connection_name: CONNECTION,
        name,
        created_at: updatedAt,
        updated_at: updatedAt,
    });
}

function installGateway(options: { scripts?: models.SavedScript[] } = {}) {
    const getScripts = vi.fn(async () => ({ ok: true as const, data: options.scripts ?? [] }));
    const saveScript = vi.fn(async (_script: models.SavedScript, _content: string) => ({
        ok: true as const,
        data: undefined,
    }));
    const deleteScript = vi.fn(async () => ({ ok: true as const, data: undefined }));
    const getScriptContent = vi.fn(async () => ({ ok: true as const, data: '' }));

    setApiGateway({
        script: { getScripts, saveScript, deleteScript, getScriptContent },
    } as unknown as ApiGateway);

    return { getScripts, saveScript, deleteScript, getScriptContent };
}

/** `mock.calls[i]` is `[script, content]`; narrow it for the assertions. */
function savedWrite(
    gateway: ReturnType<typeof installGateway>,
    index: number,
): { script: models.SavedScript; content: string } {
    const call = gateway.saveScript.mock.calls[index];
    if (!call) {
        throw new Error(`expected a saveScript call at index ${index}`);
    }
    return { script: call[0], content: call[1] };
}

describe('scriptStore.saveScript', () => {
    beforeEach(() => {
        useScriptStore.setState({
            scripts: [],
            activeProjectId: null,
            activeConnection: null,
            loadedScope: null,
        });
    });

    afterEach(() => {
        resetApiGateway();
    });

    it('reads the list once for a scope it has not loaded yet', async () => {
        const gateway = installGateway({ scripts: [makeScript('first', 'First')] });

        await useScriptStore.getState().saveScript(PROJECT_ID, CONNECTION, 'Second', 'select 1');

        expect(gateway.getScripts).toHaveBeenCalledTimes(1);
        expect(gateway.saveScript).toHaveBeenCalledTimes(1);
        const written = savedWrite(gateway, 0);
        expect(written.script.id).toBe('Second');
        expect(written.content).toBe('select 1');
    });

    it('reuses the in-memory list on the next save for the same scope', async () => {
        const gateway = installGateway({ scripts: [makeScript('first', 'First')] });

        await useScriptStore.getState().saveScript(PROJECT_ID, CONNECTION, 'First', 'select 1');
        await useScriptStore.getState().saveScript(PROJECT_ID, CONNECTION, 'First', 'select 2');
        await useScriptStore.getState().saveScript(PROJECT_ID, CONNECTION, 'First', 'select 3');

        // One read for the cold scope, then no further reads on the hot path.
        expect(gateway.getScripts).toHaveBeenCalledTimes(1);
        expect(gateway.saveScript).toHaveBeenCalledTimes(3);
        expect(savedWrite(gateway, 2).content).toBe('select 3');
    });

    it('keeps the created_at of the script it updates', async () => {
        const createdAt = '2025-05-05T05:05:05.000Z';
        const gateway = installGateway({ scripts: [makeScript('First', 'First', createdAt)] });

        await useScriptStore.getState().saveScript(PROJECT_ID, CONNECTION, 'First', 'select 1');

        expect(savedWrite(gateway, 0).script.created_at).toBe(createdAt);
    });

    it('deletes the superseded entry after renaming a script', async () => {
        const gateway = installGateway({ scripts: [makeScript('Old Name', 'Old Name')] });

        await useScriptStore
            .getState()
            .saveScript(PROJECT_ID, CONNECTION, 'New Name', 'select 1', 'Old Name');

        expect(savedWrite(gateway, 0).script.id).toBe('New Name');
        expect(gateway.deleteScript).toHaveBeenCalledWith(PROJECT_ID, CONNECTION, 'Old Name');
        expect(useScriptStore.getState().scripts.map(script => script.id)).toEqual(['New Name']);
    });

    it('rejects a name that collides with a different script', async () => {
        installGateway({
            scripts: [makeScript('Taken', 'Taken'), makeScript('Mine', 'Mine')],
        });

        await expect(
            useScriptStore
                .getState()
                .saveScript(PROJECT_ID, CONNECTION, 'Taken', 'select 1', 'Mine'),
        ).rejects.toThrow('SCRIPT_NAME_ALREADY_EXISTS:Taken');
    });

    it('rejects a name that sanitizes to nothing', async () => {
        const gateway = installGateway();

        await expect(
            useScriptStore.getState().saveScript(PROJECT_ID, CONNECTION, '///', 'select 1'),
        ).rejects.toThrow('SCRIPT_NAME_INVALID:///');
        expect(gateway.saveScript).not.toHaveBeenCalled();
    });

    it('re-reads the list when the scope changed', async () => {
        const gateway = installGateway({ scripts: [makeScript('First', 'First')] });

        await useScriptStore.getState().saveScript(PROJECT_ID, CONNECTION, 'First', 'select 1');
        await useScriptStore.getState().saveScript(PROJECT_ID, 'other-conn', 'First', 'select 1');

        expect(gateway.getScripts).toHaveBeenCalledTimes(2);
    });
});

describe('resolveScriptSaveTarget', () => {
    it('matches the existing script by derived id', () => {
        const existing = makeScript('Report', 'Report');

        const target = resolveScriptSaveTarget([existing], 'Report');

        expect(target.scriptId).toBe('Report');
        expect(target.owner).toBe(existing);
        expect(target.supersededId).toBeUndefined();
    });

    it('marks the previous id as superseded when the name changed', () => {
        const target = resolveScriptSaveTarget([makeScript('Old', 'Old')], 'New', 'Old');

        expect(target.scriptId).toBe('New');
        expect(target.supersededId).toBe('Old');
    });

    it('flags a collision between the target id and the edited script id', () => {
        const target = resolveScriptSaveTarget(
            [makeScript('Taken', 'Taken'), makeScript('Mine', 'Mine')],
            'Taken',
            'Mine',
        );

        expect(target.duplicateName).toBe('Taken');
    });

    it('flags a duplicate display name under a different id', () => {
        const target = resolveScriptSaveTarget([makeScript('other-id', 'Taken')], 'Taken');

        expect(target.duplicateName).toBe('Taken');
    });

    it('strips a .sql suffix and forbidden filename characters from the id', () => {
        const target = resolveScriptSaveTarget([], '  my/report.sql  ');

        expect(target.scriptId).toBe('my report');
    });

    it('returns an empty id for an unusable name', () => {
        expect(resolveScriptSaveTarget([], '   ').scriptId).toBe('');
    });
});
