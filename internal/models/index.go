// SPDX-License-Identifier: GPL-3.0-only

package models

// IndexInfo describes a single index on a table for the schema editor.
type IndexInfo struct {
	Name    string
	Table   string
	Columns []string
	Unique  bool
}
