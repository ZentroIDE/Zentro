// SPDX-License-Identifier: GPL-3.0-only

package constant

const (
	// Tier limits
	FreeTierProjectLimit = 5

	// Tab Types
	TabTypeQuery     = "query"
	TabTypeTable     = "table"
	TabTypeSettings  = "settings"
	TabTypeShortcuts = "shortcuts"

	// Drivers
	DriverPostgres  = "postgres"
	DriverSQLServer = "sqlserver"
	DriverMySQL     = "mysql"
	DriverSQLite    = "sqlite"

	// Connection Statuses
	StatusConnected    = "connected"
	StatusDisconnected = "disconnected"
	StatusConnecting   = "connecting"
	StatusError        = "error"

	// Transaction Statuses
	TransactionStatusNone   = "none"
	TransactionStatusActive = "active"
	TransactionStatusError  = "error"

	// Safety Levels — paired with SAFETY_LEVEL in
	// frontend/src/lib/constants.ts (crosses the wire via ExecutionPolicy);
	// keep both sides in sync, like events.
	SafetyLevelStrict   = "strict"
	SafetyLevelBalanced = "balanced"
	SafetyLevelRelaxed  = "relaxed"

	// Environment Strictness — ExecutionPolicy.environment_strictness,
	// paired with ENVIRONMENT_STRICTNESS in frontend/src/lib/constants.ts.
	// Distinct vocabulary from Safety Levels even though both use "strict".
	EnvironmentStrictnessStrict = "strict"
	EnvironmentStrictnessNormal = "normal"

	// Droppable object types — paired with OBJECT_TYPE in
	// frontend/src/lib/constants.ts (crosses the wire via DropObject).
	ObjectTypeTable = "TABLE"
	ObjectTypeView  = "VIEW"
	ObjectTypeIndex = "INDEX"
)
