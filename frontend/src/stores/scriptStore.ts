// SPDX-License-Identifier: GPL-3.0-only

import { create } from 'zustand';
import { getApiGateway } from '../platform/apiGatewayRuntime';
import { unwrapOrThrow } from '../shared/kernel';
import { models } from '../../wailsjs/go/models';

async function loadScriptList(
    projectId: string,
    connectionName: string,
): Promise<models.SavedScript[]> {
    const result = await getApiGateway().script.getScripts(projectId, connectionName);
    return result.ok ? result.data : [];
}

type SavedScript = models.SavedScript;

const normalizeScriptName = (value: string) => value.trim().toLowerCase();
const WINDOWS_FORBIDDEN_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F]/g;
const DUPLICATE_SCRIPT_NAME_ERROR = 'SCRIPT_NAME_ALREADY_EXISTS';
const INVALID_SCRIPT_NAME_ERROR = 'SCRIPT_NAME_INVALID';

export const isDuplicateScriptNameError = (error: unknown): boolean =>
    error instanceof Error && error.message.startsWith(DUPLICATE_SCRIPT_NAME_ERROR);

const baseScriptIdFromName = (name: string): string => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const withoutSqlSuffix = trimmed.replace(/\.sql$/i, '').trim();
    const sanitized = withoutSqlSuffix
        .replace(WINDOWS_FORBIDDEN_FILENAME_CHARS, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return sanitized;
};

const isSameScriptId = (left?: string, right?: string): boolean =>
    String(left || '')
        .trim()
        .toLowerCase() ===
    String(right || '')
        .trim()
        .toLowerCase();

interface ScriptTargetResolution {
    /** Empty when the name sanitizes to nothing (INVALID_SCRIPT_NAME_ERROR). */
    scriptId: string;
    /** Existing entry the write should replace, matched by target name or ID. */
    owner?: SavedScript;
    /** Previous entry to remove once the write moved the script to a new ID. */
    supersededId?: string;
    /** Set when the chosen name collides with a different script. */
    duplicateName?: string;
}

/**
 * Decides which saved script a write targets, purely from the known list.
 *
 * Extracted so `saveScript` can resolve the target from state it already has,
 * and so the conflict rules (target-ID collision, duplicate display name) are
 * testable without a backend.
 */
export function resolveScriptSaveTarget(
    scripts: SavedScript[],
    name: string,
    scriptID?: string,
): ScriptTargetResolution {
    const nextName = name.trim() || name;
    const scriptId = baseScriptIdFromName(nextName);
    if (!scriptId) {
        return { scriptId: '' };
    }

    const byId = scriptID ? scripts.find(item => item.id === scriptID) : undefined;
    const byTargetId = scripts.find(item => isSameScriptId(item.id, scriptId));
    const owner = byTargetId || byId;

    // The chosen name already belongs to a different script than the one being
    // edited — a rename onto an occupied name.
    if (byTargetId && byId && !isSameScriptId(byTargetId.id, byId.id)) {
        return { scriptId, owner, duplicateName: nextName };
    }

    const normalizedName = normalizeScriptName(nextName);
    const duplicateByName = scripts.find(
        item =>
            !isSameScriptId(item.id, scriptId) && normalizeScriptName(item.name) === normalizedName,
    );
    if (duplicateByName) {
        return { scriptId, owner, duplicateName: nextName };
    }

    return {
        scriptId,
        owner,
        // Renaming changes the derived ID, so the old file/entry has to be
        // removed once the write has landed at the new one.
        supersededId: byId && !isSameScriptId(byId.id, scriptId) ? byId.id : undefined,
    };
}

function withScriptUpserted(
    scripts: SavedScript[],
    script: SavedScript,
    supersededId?: string,
): SavedScript[] {
    const next = scripts.filter(item => item.id !== script.id && item.id !== supersededId);
    next.push(script);
    return next;
}

interface ScriptStore {
    scripts: SavedScript[];
    activeProjectId: string | null;
    activeConnection: string | null;
    /** Scope the in-memory `scripts` list was last loaded for. */
    loadedScope: { projectId: string; connectionName: string } | null;

    loadScripts: (projectId: string, connectionName: string) => Promise<void>;
    saveScript: (
        projectId: string,
        connectionName: string,
        name: string,
        content: string,
        scriptID?: string,
    ) => Promise<string>;
    deleteScript: (projectId: string, connectionName: string, scriptID: string) => Promise<void>;
    getContent: (projectId: string, connectionName: string, scriptID: string) => Promise<string>;
    clearScope: () => void;
}

export const useScriptStore = create<ScriptStore>(set => ({
    scripts: [],
    activeProjectId: null,
    activeConnection: null,
    loadedScope: null,

    loadScripts: async (projectId, connectionName) => {
        const scripts = await loadScriptList(projectId, connectionName);
        set({
            scripts,
            activeProjectId: projectId,
            activeConnection: connectionName,
            loadedScope: { projectId, connectionName },
        });
    },

    saveScript: async (projectId, connectionName, name, content, scriptID) => {
        const nextName = name.trim() || name;
        // Validate the name before any I/O: a name that sanitizes to nothing
        // can never be saved, so there is no point loading the list.
        if (!baseScriptIdFromName(nextName)) {
            throw new Error(`${INVALID_SCRIPT_NAME_ERROR}:${name}`);
        }

        const stateAtStart = useScriptStore.getState();
        const scopeMatches =
            stateAtStart.loadedScope?.projectId === projectId &&
            stateAtStart.loadedScope?.connectionName === connectionName;

        // The list is only needed to resolve which script the write replaces.
        // Reading it costs an IPC round trip plus a backend file read, and this
        // runs on every autosave tick, so it is skipped while the entries for
        // this scope are already in memory. Renames stamp the local list below,
        // and loadScripts() re-syncs whenever the scope is (re)opened.
        const existingScripts = scopeMatches
            ? stateAtStart.scripts
            : await loadScriptList(projectId, connectionName);

        const target = resolveScriptSaveTarget(existingScripts, nextName, scriptID);
        if (target.duplicateName) {
            throw new Error(`${DUPLICATE_SCRIPT_NAME_ERROR}:${target.duplicateName}`);
        }

        const now = new Date().toISOString();
        const script = models.SavedScript.createFrom({
            id: target.scriptId,
            project_id: projectId,
            connection_name: connectionName,
            name: nextName,
            created_at: String(target.owner?.created_at || now),
            updated_at: now,
        });

        unwrapOrThrow(await getApiGateway().script.saveScript(script, content));

        if (target.supersededId) {
            unwrapOrThrow(
                await getApiGateway().script.deleteScript(
                    projectId,
                    connectionName,
                    target.supersededId,
                ),
            );
        }

        // Update the in-memory list in place rather than re-reading it. The
        // sidebar and the "next query name" reservation read this list, and
        // the upsert already reflects the write that just landed. Re-reading
        // would add another IPC round trip to every autosave for no new
        // information.
        set(state => ({
            scripts: withScriptUpserted(existingScripts, script, target.supersededId),
            activeProjectId: projectId,
            activeConnection: connectionName,
            loadedScope: { projectId, connectionName },
        }));

        return target.scriptId;
    },

    deleteScript: async (projectId, connectionName, scriptID) => {
        unwrapOrThrow(
            await getApiGateway().script.deleteScript(projectId, connectionName, scriptID),
        );
        const scripts = await loadScriptList(projectId, connectionName);
        set({
            scripts,
            activeProjectId: projectId,
            activeConnection: connectionName,
            loadedScope: { projectId, connectionName },
        });
    },

    getContent: async (projectId, connectionName, scriptID) =>
        unwrapOrThrow(
            await getApiGateway().script.getScriptContent(projectId, connectionName, scriptID),
        ),

    clearScope: () =>
        set({
            scripts: [],
            activeProjectId: null,
            activeConnection: null,
            loadedScope: null,
        }),
}));
