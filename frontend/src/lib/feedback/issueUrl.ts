// SPDX-License-Identifier: GPL-3.0-only

export const REPO_ISSUE_URL = 'https://github.com/ZentroIDE/zentro-window-issue-tracker/issues/new';

export interface IssueUrlParams {
    template: string;
    title: string;
    labels: string;
    description: string;
    [key: string]: string;
}

export function buildIssueUrl(params: IssueUrlParams): string {
    return `${REPO_ISSUE_URL}?${new URLSearchParams(params).toString()}`;
}
