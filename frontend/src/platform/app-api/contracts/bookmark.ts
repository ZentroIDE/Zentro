// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../../../wailsjs/go/models';
import type { KernelResult } from '../../../shared/kernel';

export interface BookmarkAdapter {
    getBookmarks(profileName: string, dbName: string): Promise<KernelResult<models.Bookmark[]>>;
    getBookmarksByConnection(
        connectionID: string,
    ): Promise<KernelResult<Record<string, models.Bookmark[]>>>;
    saveBookmark(
        profileName: string,
        dbName: string,
        bookmark: models.Bookmark,
    ): Promise<KernelResult<void>>;
    deleteBookmark(
        profileName: string,
        dbName: string,
        lineNumber: number,
    ): Promise<KernelResult<void>>;
}
