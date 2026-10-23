// SPDX-License-Identifier: GPL-3.0-only

package models

// ForeignKeyInfo describes a foreign key constraint for the schema editor.
type ForeignKeyInfo struct {
	Name       string
	Columns    []string
	RefSchema  string
	RefTable   string
	RefColumns []string
	OnDelete   string
	OnUpdate   string
}
