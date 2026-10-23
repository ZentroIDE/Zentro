// SPDX-License-Identifier: GPL-3.0-only

package models

// CheckConstraintInfo describes a CHECK constraint for the schema editor.
type CheckConstraintInfo struct {
	Name       string
	Expression string
}

// UniqueConstraintInfo describes a UNIQUE constraint for the schema editor.
type UniqueConstraintInfo struct {
	Name    string
	Columns []string
}

// PrimaryKeyInfo describes a table's primary key for the schema editor.
type PrimaryKeyInfo struct {
	Name    string
	Columns []string
}
