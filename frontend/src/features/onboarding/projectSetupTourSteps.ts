// SPDX-License-Identifier: GPL-3.0-only

import type { DriveStep } from 'driver.js';

export const PROJECT_SETUP_TOUR_STEPS: DriveStep[] = [
    {
        element: '[data-tour="project-icon-color"]',
        popover: {
            title: 'Give it an icon and color',
            description:
                'Pick an icon and color to tell your projects apart at a glance — especially handy once you have more than one open.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="project-info"]',
        popover: {
            title: 'Set up your project',
            description:
                'Give your project a name and pick where its files are stored. A Project groups the environments and connections for one piece of work — one app, one client, or one database.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="project-env-bindings"]',
        popover: {
            title: 'Bind your environments',
            description:
                'Every project starts with Development, Staging, and Production. Bind each one to a connection and database — Production gets extra write-safety guards automatically.',
            side: 'top',
            align: 'start',
        },
    },
];
