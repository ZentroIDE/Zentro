// SPDX-License-Identifier: GPL-3.0-only

package app

import "zentro/internal/models"

// Bookmark facade — thin delegates to BookmarkService (bookmark_service.go).

func (a *App) GetBookmarks(connectionID, tabID string) ([]models.Bookmark, error) {
	return a.svc.Bookmarks.GetBookmarks(connectionID, tabID)
}

func (a *App) GetBookmarksByConnection(connectionID string) (map[string][]models.Bookmark, error) {
	return a.svc.Bookmarks.GetBookmarksByConnection(connectionID)
}

func (a *App) SaveBookmark(connectionID, tabID string, bookmark models.Bookmark) error {
	return a.svc.Bookmarks.SaveBookmark(connectionID, tabID, bookmark)
}

func (a *App) DeleteBookmark(connectionID, tabID string, line int) error {
	return a.svc.Bookmarks.DeleteBookmark(connectionID, tabID, line)
}
