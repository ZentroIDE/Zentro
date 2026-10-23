// SPDX-License-Identifier: GPL-3.0-only

/** Stable identity key for a connection profile + database + driver, used to
 *  scope client-owned preferences (explorer tree state, marked image columns,
 *  ...) that must not bleed across different connections/databases. */
export function buildConnectionIdentityKey(
    profileName: string,
    dbName: string,
    driver: string,
): string {
    return `${profileName}:${dbName}:${driver || 'unknown'}`;
}
