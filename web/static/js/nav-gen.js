// Navigation generation counter — shared between the router and page modules.
// Incremented on every route change so async callbacks can detect stale renders.
let _navGen = 0;
export function navGen() { return _navGen; }
export function bumpNavGen() { _navGen++; }
