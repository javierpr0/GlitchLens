// Module hooks for the unit tests. They let `node --test` load the app's TypeScript as it is:
// the "@/" alias, extensionless imports, and tiny stand-ins for Next.js APIs that only exist inside a request.
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const src = path.join(root, "src");

const APP_ONLY_SHIMS = {
  react: "react.mjs",
  "next/headers": "next-headers.mjs",
  "next/navigation": "next-navigation.mjs",
};

const isFile = (p) => existsSync(p) && statSync(p).isFile();

function withExtension(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts"), base]) {
    if (isFile(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL ? fileURLToPath(context.parentURL) : "";
  const fromApp = parent.startsWith(root + path.sep) && !parent.includes(`${path.sep}node_modules${path.sep}`);

  if (specifier === "server-only") {
    return { url: pathToFileURL(path.join(here, "shims/server-only.mjs")).href, shortCircuit: true };
  }
  if (fromApp && APP_ONLY_SHIMS[specifier]) {
    return { url: pathToFileURL(path.join(here, "shims", APP_ONLY_SHIMS[specifier])).href, shortCircuit: true };
  }
  if (fromApp && specifier.startsWith("@/")) {
    const file = withExtension(path.join(src, specifier.slice(2)));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  if (fromApp && specifier.startsWith(".") && !path.extname(specifier)) {
    const file = withExtension(path.resolve(path.dirname(parent), specifier));
    if (file) return { url: pathToFileURL(file).href, shortCircuit: true };
  }
  // Next ships CommonJS subpaths without extensions, which Node's ESM resolver refuses.
  if (fromApp && /^next\/[\w-]+$/.test(specifier)) {
    try {
      return await nextResolve(`${specifier}.js`, context);
    } catch {
      /* fall through to the default resolution and its own error */
    }
  }
  return nextResolve(specifier, context);
}
