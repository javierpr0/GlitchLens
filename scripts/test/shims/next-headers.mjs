// A fake "current request" that tests control through globalThis.__testRequest.
const current = () => globalThis.__testRequest ?? { cookies: {}, headers: {} };

export async function cookies() {
  return {
    get(name) {
      const value = current().cookies[name];
      return value === undefined ? undefined : { name, value };
    },
    has(name) {
      return current().cookies[name] !== undefined;
    },
  };
}

export async function headers() {
  return new Headers(current().headers);
}
