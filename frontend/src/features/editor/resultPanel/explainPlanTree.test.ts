// SPDX-License-Identifier: GPL-3.0-only

import { describe, expect, it } from 'vitest';

import { buildExplainPlanViewModel } from './explainPlanTree';

describe('buildExplainPlanViewModel', () => {
    it('builds a visual tree model from postgres explain json', () => {
        const model = buildExplainPlanViewModel([
            {
                'Planning Time': 0.67,
                'Execution Time': 172.682,
                Plan: {
                    'Node Type': 'Aggregate',
                    'Actual Total Time': 54,
                    'Actual Rows': 1,
                    'Total Cost': 1758.75,
                    'Group Key': ['c.state'],
                    Plans: [
                        {
                            'Node Type': 'Hash Join',
                            'Join Type': 'Inner',
                            'Hash Cond': '(ch.orderid = o.orderid)',
                            'Actual Total Time': 39,
                            'Actual Rows': 60350,
                            'Total Cost': 1300.4,
                            Plans: [
                                {
                                    'Node Type': 'Seq Scan',
                                    'Relation Name': 'cust_hist',
                                    Schema: 'public',
                                    Alias: 'ch',
                                    'Actual Total Time': 10,
                                    'Actual Rows': 60350,
                                    'Total Cost': 400,
                                },
                                {
                                    'Node Type': 'Hash',
                                    'Actual Total Time': 7,
                                    'Actual Rows': 3200,
                                    'Total Cost': 50,
                                },
                            ],
                        },
                    ],
                },
            },
        ]);

        expect(model).not.toBeNull();
        expect(model?.summary.mode).toBe('actual');
        expect(model?.summary.executionTimeMs).toBe(172.682);
        expect(model?.summary.planningTimeMs).toBe(0.67);
        expect(model?.summary.slowestNodeMs).toBe(54);
        expect(model?.summary.largestNodeRows).toBe(60350);
        expect(model?.summary.costliestNodeCost).toBe(1758.75);
        expect(model?.root.title).toBe('Aggregate');
        expect(model?.root.badges).toContain('slowest');
        expect(model?.root.badges).toContain('costliest');
        expect(model?.root.detailLines).toContain('by c.state');
        expect(model?.root.children[0]?.badges).toContain('largest');
        expect(model?.root.children[0]?.detailLines).toContain('Inner join');
        expect(model?.root.children[0]?.detailLines[1]).toContain('hash');
        expect(model?.root.children[0]?.children[0]?.relationLabel).toBe(
            'on public.cust_hist (ch)',
        );
    });

    it('returns null for non explain json', () => {
        expect(buildExplainPlanViewModel({ ok: true })).toBeNull();
        expect(buildExplainPlanViewModel([{ foo: 'bar' }])).toBeNull();
    });
});
