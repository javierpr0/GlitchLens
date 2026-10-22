// React's per-request `cache` has no request to scope to here: calling the function each time is the safe stand-in.
export const cache = (fn) => fn;
