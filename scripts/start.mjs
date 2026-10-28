import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
const root = fileURLToPath(new URL("..", import.meta.url));
dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const url = `http://127.0.0.1:${Number(process.env.PORT) || 4173}`;
const open = () =>
  spawn("cmd", ["/c", "start", "", url], {
    windowsHide: true,
    stdio: "ignore",
  }).unref();
async function online() {
  try {
    const r = await fetch(url + "/api/status", {
      signal: AbortSignal.timeout(1000),
    });
    return r.ok && (await r.json()).configured !== undefined;
  } catch {
    return false;
  }
}
if (await online()) {
  console.log(`见数已运行：${url}`);
  open();
} else {
  const server = spawn(process.execPath, ["server/index.mjs"], {
    cwd: root,
    stdio: "inherit",
  });
  server.on("error", () => {
    console.error("服务启动失败。");
    process.exitCode = 1;
  });
  server.on("exit", (code) => {
    process.exitCode = code || 0;
  });
  for (let attempt = 0; attempt < 50; attempt++) {
    if (await online()) {
      open();
      break;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}
