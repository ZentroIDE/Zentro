// SPDX-License-Identifier: GPL-3.0-only

package models

// CatalogObjectDetails describes a single catalog object (index, routine,
// sequence, data type, ...) for the schema-explorer detail panel.
type CatalogObjectDetails struct {
	ObjectKind         string   `json:"objectKind"`
	Name               string   `json:"name"`
	Schema             string   `json:"schema"`
	TableName          string   `json:"tableName,omitempty"`
	DDL                string   `json:"ddl,omitempty"`
	Signature          string   `json:"signature,omitempty"`
	Columns            []string `json:"columns,omitempty"`
	Unique             bool     `json:"unique"`
	PrimaryKey         bool     `json:"primaryKey"`
	UnsupportedMessage string   `json:"unsupportedMessage,omitempty"`
}
