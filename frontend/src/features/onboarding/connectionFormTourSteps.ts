// SPDX-License-Identifier: GPL-3.0-only

import type { DriveStep } from 'driver.js';

export const CONNECTION_FORM_TOUR_STEPS: DriveStep[] = [
    {
        element: '[data-tour="connection-provider"]',
        popover: {
            title: 'Pick your database type',
            description:
                'Choose Postgres, MySQL, SQL Server, or SQLite. This determines which fields you need below, and cannot be changed once the connection is saved.',
            side: 'right',
            align: 'center',
        },
    },
    {
        element: '[data-tour="connection-db-info"]',
        popover: {
            title: 'Enter your connection details',
            description:
                'Name the connection, then fill in the host, port, and credentials for the server — or the file path for SQLite. The specific database is picked later, per environment.',
            side: 'left',
            align: 'start',
        },
    },
    {
        element: '[data-tour="connection-test"]',
        popover: {
            title: 'Test before you save',
            description:
                'Verify Zentro can actually reach the server with these credentials before saving the connection.',
            side: 'top',
            align: 'start',
        },
    },
];
