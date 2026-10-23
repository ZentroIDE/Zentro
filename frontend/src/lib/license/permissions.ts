// SPDX-License-Identifier: GPL-3.0-only

import { FeatureGate } from './featureGate';
import { FEATURE, type FeatureId } from './entitlementMatrix';

export type Permission =
    | 'query.execute'
    | 'query.export'
    | 'query.search'
    | 'schema.view'
    | 'schema.edit'
    | 'connection.manage'
    | 'connection.import'
    | 'project.manage'
    | 'security.app-lock'
    | 'security.secret-vault'
    | 'security.pii-detection'
    | 'recovery.schema-snapshot'
    | 'recovery.schema-rollback'
    | 'team.shared-connections'
    | 'team.audit'
    | 'enterprise.sso'
    | 'enterprise.audit-trail'
    | 'enterprise.airgap'
    | 'admin.users'
    | 'admin.settings'
    | 'plugin.install';

const PERMISSION_TO_FEATURE: Record<Permission, FeatureId> = {
    'query.execute': FEATURE.QUERY_EXECUTE_BASIC,
    'query.export': FEATURE.QUERY_RESULT_EXPORT,
    'query.search': FEATURE.QUERY_RESULT_SEARCH,
    'schema.view': FEATURE.SCHEMA_DIFF_BASIC,
    'schema.edit': FEATURE.SCHEMA_DIFF_BASIC,
    'connection.manage': FEATURE.TEAM_SHARED_CONNECTIONS,
    'connection.import': FEATURE.QUERY_EXECUTE_BASIC,
    'project.manage': FEATURE.PROJECTS_UNLIMITED,
    'security.app-lock': FEATURE.SECURITY_APP_LOCK,
    'security.secret-vault': FEATURE.SECURITY_SECRET_VAULT,
    'security.pii-detection': FEATURE.SECURITY_PII_DETECTION,
    'recovery.schema-snapshot': FEATURE.RECOVERY_SCHEMA_SNAPSHOT,
    'recovery.schema-rollback': FEATURE.RECOVERY_SCHEMA_ROLLBACK,
    'team.shared-connections': FEATURE.TEAM_SHARED_CONNECTIONS,
    'team.audit': FEATURE.TEAM_AUDIT_USER_IDENTITY,
    'enterprise.sso': FEATURE.ENTERPRISE_SSO,
    'enterprise.audit-trail': FEATURE.ENTERPRISE_AUDIT_COMPLIANCE,
    'enterprise.airgap': FEATURE.ENTERPRISE_OFFLINE_AIRGAP,
    'admin.users': FEATURE.TEAM_RBAC,
    'admin.settings': FEATURE.TEAM_RBAC,
    'plugin.install': FEATURE.PLUGIN_UI_COMMANDS,
};

export interface PermissionCheck {
    allowed: boolean;
    permission: Permission;
    featureId: FeatureId;
    reason?: string;
}

export function checkPermission(gate: FeatureGate, permission: Permission): PermissionCheck {
    const featureId = PERMISSION_TO_FEATURE[permission];
    const access = gate.getFeatureAccess(featureId);
    return {
        allowed: access.state === 'enabled',
        permission,
        featureId,
        reason: access.state !== 'enabled' ? access.helperText : undefined,
    };
}
