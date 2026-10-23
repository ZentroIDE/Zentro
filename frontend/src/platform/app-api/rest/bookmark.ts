// SPDX-License-Identifier: GPL-3.0-only

import { withKernelResult } from '../../../shared/kernel';
import type { BookmarkAdapter } from '../contracts/bookmark';
import type { RestHttpClient } from './httpClient';
import type { models } from '../../../../wailsjs/go/models';

export function createBookmarkRestAdapter(client: RestHttpClient): BookmarkAdapter {
    return withKernelResult('bookmark', {
        getBookmarks: (profileName: string, dbName: string) =>
            client.call<models.Bookmark[]>('/bookmark/get-bookmarks', { profileName, dbName }),
        getBookmarksByConnection: (connectionID: string) =>
            client.call<Record<string, models.Bookmark[]>>(
                '/bookmark/get-bookmarks-by-connection',
                { connectionID },
            ),
        saveBookmark: (profileName: string, dbName: string, bookmark: models.Bookmark) =>
            client.call<void>('/bookmark/save-bookmark', { profileName, dbName, bookmark }),
        deleteBookmark: (profileName: string, dbName: string, lineNumber: number) =>
            client.call<void>('/bookmark/delete-bookmark', {
                profileName,
                dbName,
                lineNumber,
            }),
    });
}
