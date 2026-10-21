// End-to-end suite: starts three fake GlitchTip servers and a production GlitchLens
// on a throwaway data dir, then drives it over HTTP. Run `npm run build` first.
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { start } from "./mock-glitchtip.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const port = process.env.E2E_PORT ?? "3100";

if (!existsSync(path.join(root, ".next", "BUILD_ID"))) {
  console.error("No production build found. Run `npm run build` first.");
  process.exit(2);
}

const data = mkdtempSync(path.join(os.tmpdir(), "glitchlens-e2e-"));
const mocks = [
  await start(4101, { token: "tokA-secret-111", orgName: "Acme Alpha" }),
  await start(4102, { token: "tokB-secret-222", orgName: "Beta Org" }),
  await start(4103, { prefix: "tokC-", orgName: "Gamma Personal" }),
];

const server = spawn(path.join(root, "node_modules/.bin/next"), ["start", "-p", port, "-H", "127.0.0.1"], {
  cwd: root,
  env: { ...process.env, GLITCHLENS_DATA_DIR: data },
  stdio: ["ignore", "pipe", "inherit"],
});

function cleanup() {
  server.kill();
  for (const m of mocks) m.close();
  rmSync(data, { recursive: true, force: true });
}

const code = await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error("Timed out waiting for the setup code")), 30_000);
  let buf = "";
  server.stdout.on("data", (chunk) => {
    buf += chunk;
    const m = buf.match(/Setup code: (\S+)/);
    if (m) {
      clearTimeout(timer);
      resolve(m[1]);
    }
  });
  server.on("exit", () => reject(new Error("GlitchLens exited before printing the setup code")));
}).catch((e) => {
  console.error(e.message);
  cleanup();
  process.exit(1);
});

const suite = spawn(process.execPath, [path.join(path.dirname(fileURLToPath(import.meta.url)), "e2e.mjs")], {
  env: { ...process.env, BASE: `http://127.0.0.1:${port}`, DATA: data, SETUP_CODE: code },
  stdio: "inherit",
});
suite.on("exit", (status) => {
  cleanup();
  process.exit(status ?? 1);
});
