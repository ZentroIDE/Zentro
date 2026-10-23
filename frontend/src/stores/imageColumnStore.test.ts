// SPDX-License-Identifier: GPL-3.0-only

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getImageColumnsByConnectionMock, setImageColumnMock } = vi.hoisted(() => ({
    getImageColumnsByConnectionMock: vi.fn(),
    setImageColumnMock: vi.fn(),
}));

vi.mock('../../wailsjs/go/app/App', async importOriginal => {
    const actual = await importOriginal<typeof import('../../wailsjs/go/app/App')>();
    return {
        ...actual,
        GetImageColumnsByConnection: getImageColumnsByConnectionMock,
        SetImageColumn: setImageColumnMock,
    };
});

import { useImageColumnStore } from './imageColumnStore';

describe('imageColumnStore', () => {
    beforeEach(() => {
        getImageColumnsByConnectionMock.mockReset();
        setImageColumnMock.mockReset();
        useImageColumnStore.setState({ activeScopeKey: null, byTable: {} });
    });

    it('loads and indexes marked columns by table for the active connection scope', async () => {
        getImageColumnsByConnectionMock.mockResolvedValue({
            'public.products': ['thumbnail_url', 'banner_url'],
        });

        await useImageColumnStore.getState().loadForConnection('conn-1');

        const state = useImageColumnStore.getState();
        expect(state.activeScopeKey).toBe('conn-1');
        expect(state.byTable['public.products']).toEqual(new Set(['thumbnail_url', 'banner_url']));
        expect(state.isMarked('conn-1', 'public.products', 'thumbnail_url')).toBe(true);
        expect(state.isMarked('conn-1', 'public.products', 'unrelated_col')).toBe(false);
    });

    it('returns false for a connection scope that has not been loaded', () => {
        const state = useImageColumnStore.getState();
        expect(state.isMarked('conn-unknown', 'public.products', 'thumbnail_url')).toBe(false);
    });

    it('toggleMark marks an unmarked column and persists it via the API', async () => {
        setImageColumnMock.mockResolvedValue(undefined);

        await useImageColumnStore.getState().toggleMark('conn-1', 'public.products', 'avatar_url');

        expect(setImageColumnMock).toHaveBeenCalledWith(
            'conn-1',
            'public.products',
            'avatar_url',
            true,
        );
        expect(
            useImageColumnStore.getState().isMarked('conn-1', 'public.products', 'avatar_url'),
        ).toBe(true);
    });

    it('toggleMark unmarks an already-marked column', async () => {
        getImageColumnsByConnectionMock.mockResolvedValue({
            'public.products': ['thumbnail_url'],
        });
        await useImageColumnStore.getState().loadForConnection('conn-1');
        setImageColumnMock.mockResolvedValue(undefined);

        await useImageColumnStore
            .getState()
            .toggleMark('conn-1', 'public.products', 'thumbnail_url');

        expect(setImageColumnMock).toHaveBeenCalledWith(
            'conn-1',
            'public.products',
            'thumbnail_url',
            false,
        );
        expect(
            useImageColumnStore.getState().isMarked('conn-1', 'public.products', 'thumbnail_url'),
        ).toBe(false);
    });
});
