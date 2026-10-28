import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const cookies = new Map();
async function fetch(url, options = {}) {
  const base = new URL(url).origin;
  return globalThis.fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      ...(cookies.has(base) ? { Cookie: cookies.get(base) } : {}),
    },
  });
}
async function freePort() {
  const s = http.createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const port = s.address().port;
  await new Promise((r) => s.close(r));
  return port;
}
async function start(t, extra = {}) {
  const temp = await mkdtemp(path.join(os.tmpdir(), "seet-api-test-"));
  const port = await freePort();
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      AI_API_KEY: "",
      AI_MODEL: "",
      ...extra,
      PORT: String(port),
      USER_STORE: path.join(temp, "users.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill();
    await new Promise((r) => child.once("exit", r));
    await rm(temp, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("server startup timeout")),
      5000,
    );
    child.stdout.on("data", () => {
      clearTimeout(timer);
      resolve();
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error("exit " + code));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  const auth = await fetch(base + "/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "api_test_user",
      password: "Api-test-2026!",
    }),
  });
  cookies.set(base, auth.headers.get("set-cookie"));
  return base;
}
test("unconfigured server reports mode and refuses model calls", async (t) => {
  const base = await start(t);
  assert.equal(
    (await (await fetch(base + "/api/status")).json()).configured,
    false,
  );
  const res = await fetch(base + "/api/extract", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "甲收入100元" }),
  });
  assert.equal(res.status, 503);
  assert.equal((await fetch(base + "/.env")).status, 404);
});
test("model boundary validates upstream structured data (mock provider)", async (t) => {
  let output = {
    title: "数据",
    metrics: [{ key: "收入", unit: "元" }],
    rows: [{ name: "甲", 收入: 100 }],
  };
  let request;
  const upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    request = JSON.parse(raw);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(output) } }],
      }),
    );
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  t.after(() => upstream.close());
  const base = await start(t, {
    AI_API_KEY: "test-only",
    AI_MODEL: "mimo-v2.6-flash",
    AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
  });
  const call = () =>
    fetch(base + "/api/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "甲收入100元" }),
    });
  let result = await call();
  assert.equal(result.status, 200);
  assert.equal((await result.json()).dataset.rows[0].收入, 100);
  assert.equal(request.messages[0].role, "system");
  assert.equal(request.model, "mimo-v2.6-flash");
  assert.deepEqual(request.thinking, { type: "disabled" });
  assert.deepEqual(request.response_format, { type: "json_object" });
  assert.equal(request.max_completion_tokens, 8192);
  output = {
    title: "bad",
    metrics: [{ key: "收入", unit: "元" }],
    rows: [{ name: "甲", 收入: "made up" }],
  };
  result = await call();
  assert.equal(result.status, 502);
  result = await fetch(base + "/api/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://unrelated.example",
    },
    body: "{}",
  });
  assert.equal(result.status, 403);
});
