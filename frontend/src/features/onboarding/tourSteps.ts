// SPDX-License-Identifier: GPL-3.0-only

import type { DriveStep } from 'driver.js';

export const ONBOARDING_TOUR_STEPS: DriveStep[] = [
    {
        element: '[data-tour="toolbar-project"]',
        popover: {
            title: 'Projects group your work',
            description:
                'A Project bundles together the environments and connections for one piece of work. Click here to switch projects or create a new one.',
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="toolbar-connection"]',
        popover: {
            title: 'Your active connection',
            description:
                'Shows the server, database, and schema you are connected to right now. Click for full connection details, or use the reload icon on the left to reconnect.',
            side: 'bottom',
            align: 'center',
        },
    },
    {
        element: '[data-tour="toolbar-environment"]',
        popover: {
            title: 'Switch environments',
            description:
                'A project can have several environments (e.g. Development, Staging, Production), each bound to its own connection. Production environments get extra write-safety guards to help prevent accidents.',
            side: 'bottom',
            align: 'end',
        },
    },
    {
        element: '[data-tour="database-explorer"]',
        popover: {
            title: 'Browse your schema',
            description:
                'This is your Database Explorer — every schema, table, and view in the active connection lives here. Use the filter box to jump straight to an object.',
            side: 'right',
            align: 'start',
        },
    },
    {
        element: '[data-tour="query-tabs"]',
        popover: {
            title: 'Write and run queries',
            description:
                'Write SQL here and run it with Ctrl+Enter (Cmd+Enter on macOS). Open as many tabs as you need, and drag them to reorder.',
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="settings-button"]',
        popover: {
            title: 'Everything else lives in Settings',
            description:
                'Appearance, SQL formatting, write-safety rules, security, and adding more connections — all configurable from here whenever you need them.',
            side: 'bottom',
            align: 'end',
        },
    },
];

/** Shown when the workspace has no project yet: Welcome is the only surface that can act. */
export const NO_PROJECT_TOUR_STEPS: DriveStep[] = [
    {
        element: '[data-tour="project-welcome"]',
        popover: {
            title: 'Start with a project',
            description:
                'A Project holds your scripts, environments and history. Create a new one, or open a folder that is already a Zentro project. Recent projects are listed below.',
            side: 'left',
            align: 'center',
        },
    },
    {
        element: '[data-tour="toolbar-project"]',
        popover: {
            title: 'Switch projects any time',
            description:
                'Once you have a project, use this to switch between projects, create another one, or open a project folder.',
            side: 'bottom',
            align: 'start',
        },
    },
    {
        element: '[data-tour="settings-button"]',
        popover: {
            title: 'Everything else lives in Settings',
            description:
                'Appearance, SQL formatting, write-safety rules, security, and adding more connections — all configurable from here whenever you need them.',
            side: 'bottom',
            align: 'end',
        },
    },
];
