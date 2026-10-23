// SPDX-License-Identifier: GPL-3.0-only

// Reads a Wails-bound function by name without a static named import. A
// build exported without the `pro_*.go` file that defines a Pro-only method
// (ADR 0019) regenerates `wailsjs/go/app/App` without that export entirely —
// a plain `import { X } from '.../App'` would fail at compile time (TS2305)
// the moment X is absent, not just at call time. This indexes into the
// module namespace instead, so the adapter can check for `undefined` like it
// already does for every other optional Pro capability.
import * as WailsApp from '../../../wailsjs/go/app/App';

type LooseWailsModule = Record<string, unknown>;
const looseModule: LooseWailsModule = WailsApp;

export function optionalWailsBinding<T extends (...args: never[]) => unknown>(
    name: string,
): T | undefined {
    return looseModule[name] as T | undefined;
}
