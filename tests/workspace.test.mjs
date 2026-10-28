import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
const apiCookies = new Map();

async function start(t, extra = {}) {
  const socket = http.createServer();
  await new Promise((r) => socket.listen(0, "127.0.0.1", r));
  const port = socket.address().port;
  await new Promise((r) => socket.close(r));
  const dir = await mkdtemp(path.join(os.tmpdir(), "jianshu-auth-"));
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: new URL("..", import.meta.url),
    env: {
      ...process.env,
      AI_API_KEY: "",
      AI_MODEL: "",
      ...extra,
      PORT: String(port),
      USER_STORE: path.join(dir, "users.json"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(async () => {
    child.kill();
    await new Promise((r) => child.once("exit", r));
    await rm(dir, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("startup timeout")), 5000);
    child.stdout.once("data", () => {
      clearTimeout(timer);
      resolve();
    });
    child.once("error", reject);
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
  apiCookies.set(base, auth.headers.get("set-cookie"));
  return {
    base,
    file: path.join(dir, "users.json"),
  };
}
const post = (base, url, body, cookie) =>
  fetch(base + url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(cookie || apiCookies.get(base)
        ? { Cookie: cookie || apiCookies.get(base) }
        : {}),
    },
    body: JSON.stringify(body),
  });

test("help and login subpages load directly", async (t) => {
  const { base } = await start(t);
  for (const route of ["/help", "/login", "/history"]) {
    const r = await fetch(base + route);
    assert.equal(r.status, 200);
    assert.match(r.headers.get("content-type"), /text\/html/);
  }
});

test("register, login, reject incorrect password, session and logout", async (t) => {
  const { base, file } = await start(t);
  const credentials = { username: "reviewer_test", password: "Demo-test-2026" };
  let r = await post(base, "/api/auth/register", credentials);
  assert.equal(r.status, 201);
  const cookie = r.headers.get("set-cookie");
  assert.match(cookie, /HttpOnly/i);
  assert.equal(
    (
      await (
        await fetch(base + "/api/auth/me", { headers: { Cookie: cookie } })
      ).json()
    ).user.username,
    credentials.username,
  );
  const stored = await readFile(file, "utf8");
  assert.ok(!stored.includes(credentials.password));
  assert.ok(!stored.includes(cookie));
  r = await post(base, "/api/auth/login", {
    ...credentials,
    password: "incorrect",
  });
  assert.equal(r.status, 401);
  r = await post(base, "/api/auth/register", credentials);
  assert.equal(r.status, 409);
  r = await post(base, "/api/auth/login", credentials);
  assert.equal(r.status, 200);
  const loginCookie = r.headers.get("set-cookie");
  r = await post(base, "/api/auth/logout", {}, loginCookie);
  assert.equal(r.status, 200);
  assert.equal(
    (
      await (
        await fetch(base + "/api/auth/me", { headers: { Cookie: loginCookie } })
      ).json()
    ).user,
    null,
  );
});

test("AI chat passes data context and validates output actions", async (t) => {
  let response = { kind: "action", action: "line", answer: "已切换为折线图。" };
  let received;
  const upstream = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    received = JSON.parse(raw);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(response) },
          },
        ],
      }),
    );
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  t.after(() => upstream.close());
  const { base } = await start(t, {
    AI_API_KEY: "mock-only",
    AI_MODEL: "mimo-v2.6-flash",
    AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
  });
  const dataset = {
    title: "销售",
    metrics: [{ key: "销量", unit: "杯" }],
    rows: [
      { name: "周一", 销量: 120 },
      { name: "周二", 销量: 150 },
    ],
  };
  let r = await post(base, "/api/chat", {
    text: "换成折线图",
    dataset,
    metricKey: "销量",
  });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).action, "line");
  assert.match(received.messages[1].content, /270/);
  response = { kind: "action", action: "run_code", answer: "无效操作" };
  r = await post(base, "/api/chat", { text: "分析", dataset });
  assert.equal(r.status, 502);
  response = {
    kind: "dataset",
    dataset: {
      title: "无效",
      metrics: [{ key: "收入", unit: "元" }],
      rows: [{ name: "甲", 收入: "胡编" }],
    },
  };
  r = await post(base, "/api/chat", { text: "甲收入100元" });
  assert.equal(r.status, 502);

  response = {
    title: "首次录入",
    metrics: [{ key: "销量", unit: "杯" }],
    rows: [{ name: "周一", 销量: 120 }],
  };
  r = await post(base, "/api/chat", { text: "周一售出120杯" });
  assert.equal(r.status, 200);
  assert.equal((await r.json()).kind, "dataset");
  assert.match(received.messages.at(-1).content, /"dataStatus":"empty"/);
});

test("provider errors and truncated output return actionable messages without credentials", async (t) => {
  let status = 401;
  const upstream = http.createServer((req, res) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify(
        status === 200
          ? {
              choices: [
                { finish_reason: "length", message: { content: '{"kind":' } },
              ],
            }
          : { error: { message: "sensitive-provider-detail" } },
      ),
    );
  });
  await new Promise((r) => upstream.listen(0, "127.0.0.1", r));
  t.after(() => upstream.close());
  const { base } = await start(t, {
    AI_API_KEY: "mock-private-key",
    AI_MODEL: "mimo-v2.6-flash",
    AI_BASE_URL: `http://127.0.0.1:${upstream.address().port}/v1`,
  });
  let r = await post(base, "/api/chat", { text: "甲收入100元" });
  assert.equal(r.status, 502);
  let error = (await r.json()).error;
  assert.match(error, /认证失败/);
  assert.ok(
    !error.includes("mock-private-key") &&
      !error.includes("sensitive-provider-detail"),
  );
  status = 200;
  r = await post(base, "/api/chat", { text: "甲收入100元" });
  assert.equal(r.status, 502);
  assert.match((await r.json()).error, /截断/);
});
