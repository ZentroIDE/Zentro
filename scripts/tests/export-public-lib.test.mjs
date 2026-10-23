import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matcher } from '../export-public-lib.mjs';

const denied = matcher([
    '**/pro_*',
    '**/pro/',
    'frontend/src/pro/',
    '.env.txt',
    'api.md',
]);

test('files named pro_* are denied at any depth, tests and test data included', () => {
    assert.equal(denied('internal/extensions/license/testdata/pro_tier_features.golden.json'), true);
    assert.equal(denied('pro_x.go'), true);
    assert.equal(denied('internal/app/pro_write_guard.go'), true);
    assert.equal(denied('internal/app/pro_write_guard_test.go'), true);
});

test('only the pro_ prefix counts', () => {
    assert.equal(denied('internal/app/improve.go'), false);
    assert.equal(denied('internal/app/write_guard_pro.go'), false);
    assert.equal(denied('internal/app/pro.go'), false);
    assert.equal(denied('internal/app/prox.txt'), false);
});

test('a pro/ directory is denied with everything below it', () => {
    assert.equal(denied('internal/pro/x.go'), true);
    assert.equal(denied('internal/extensions/pro/deep/y.go'), true);
    assert.equal(denied('frontend/src/pro/index.ts'), true);
    assert.equal(denied('frontend/src/pro/a/b.tsx'), true);
});

test('a directory name that merely contains pro is kept', () => {
    assert.equal(denied('internal/project/x.go'), false);
    assert.equal(denied('frontend/src/product/x.ts'), false);
    assert.equal(denied('frontend/src/proxy/x.ts'), false);
});

test('exact files match only themselves', () => {
    assert.equal(denied('.env.txt'), true);
    assert.equal(denied('docs/api.md'), false);
    assert.equal(denied('api.md'), true);
    assert.equal(denied('api.mdx'), false);
});
