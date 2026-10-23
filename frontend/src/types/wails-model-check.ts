// SPDX-License-Identifier: GPL-3.0-only

import type { models } from '../../wailsjs/go/models';
import type { ConnectionProfile } from './connection';

type AssertConnectionProfileCompat = models.ConnectionProfile extends ConnectionProfile
    ? true
    : false;
const assertConnectionProfileCompat: AssertConnectionProfileCompat = true;

export { assertConnectionProfileCompat };
