import dotenv from "dotenv";
import express from "express";
import { fileURLToPath } from "node:url";
import { authRouter } from "./auth.mjs";
import { ready, runAI } from "./ai.mjs";
import { recordsRouter } from "./records.mjs";
import { runAgent } from "./agent.mjs";
import { speechRouter } from './speech.mjs';
import { reportRouter } from './report/index.mjs';

dotenv.config({
  path: fileURLToPath(new URL("../.env", import.meta.url)),
  quiet: true,
});
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "20mb" }));
app.use("/api", (req, res, next) => {
  res.set("Cache-Control", "no-store");
  const origin = req.headers.origin;
  if (origin) {
    try {
      const u = new URL(origin);
      if (
        !["localhost", "127.0.0.1"].includes(u.hostname) &&
        u.host !== req.get("host")
      )
        return res.status(403).json({ error: "页面来源不受允许。" });
    } catch {
      return res.status(403).json({ error: "无效来源。" });
    }
  }
  next();
});
const auth = authRouter();
app.use("/api/auth", auth);
app.use("/api/analyses", auth.requireAuth, recordsRouter());
app.use('/api/speech',auth.requireAuth,speechRouter());
app.use('/api/report',auth.requireAuth,reportRouter());
app.get("/api/status", (_, res) =>
  res.json({
    configured: ready(),
    model: ready() ? process.env.AI_MODEL : null,
  }),
);
let active = 0;
app.post("/api/agent", auth.requireAuth, async (req, res) => {
  if (req.body?.owner && req.body.owner !== req.user.username)
    return res.status(409).json({ error: "登录账号已改变，请刷新后继续。" });
  if (!ready()) return res.status(503).json({ error: "AI 服务尚未配置。" });
  if (
    typeof req.body?.text !== "string" ||
    !req.body.text.trim() ||
    req.body.text.length > 12000
  )
    return res.status(400).json({ error: "请输入 1–12000 字的分析需求。" });
  if (active >= 2)
    return res.status(429).json({ error: "AI 正在处理其他请求，请稍后重试。" });
  active++;
  const controller = new AbortController(),
    timeout = setTimeout(() => controller.abort(), 90000);
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  res.set({
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();
  const emit = (event) => {
    if (!res.destroyed) res.write(JSON.stringify(event) + "\n");
  };
  try {
    const result = await runAgent(req.body, emit, controller.signal);
    emit({ type: "result", result });
  } catch (e) {
    const status = e.statusCode || e.status;
    emit({
      type: "error",
      error:
        {
          401: "MiMo 密钥认证失败。",
          402: "MiMo 账户额度不足。",
          429: "MiMo 请求频率或额度达到限制。",
        }[status] ||
        (controller.signal.aborted
          ? "任务已停止或超时，可重试。"
          : "Agent 调用失败，请检查网络后重试。"),
    });
  } finally {
    active--;
    clearTimeout(timeout);
    res.end();
  }
});
app.post(["/api/extract", "/api/chat"], auth.requireAuth, async (req, res) => {
  if (req.body?.owner && req.body.owner !== req.user.username)
    return res
      .status(409)
      .json({ error: "登录账号已改变，请刷新页面后继续。" });
  if (!ready())
    return res
      .status(503)
      .json({ error: "AI 服务尚未配置，请联系作品管理员。" });
  if (
    typeof req.body?.text !== "string" ||
    req.body.text.length > 12000 ||
    !req.body.text.trim()
  )
    return res.status(400).json({ error: "请输入 1–12000 字的数据描述。" });
  if (active >= 2)
    return res.status(429).json({ error: "AI 正在处理其他请求，请稍后重试。" });
  active++;
  try {
    res.json(await runAI(req.body, req.path === "/api/chat"));
  } catch (error) {
    res.status(error.status || 502).json({
      error: error.public
        ? error.message
        : error.name === "TimeoutError"
          ? "MiMo 响应超时，请稍后重试。"
          : "AI 连接或数据整理失败，请检查网络后重试，或简化数据描述。",
    });
  } finally {
    active--;
  }
});
const dist = fileURLToPath(new URL("../dist", import.meta.url));
app.use(express.static(dist));
app.get(["/", "/help", "/login", "/history"], (_, res) =>
  res.sendFile(dist + "/index.html"),
);
app.use((err, req, res, next) =>
  res
    .status(err.type === "entity.too.large" ? 413 : 400)
    .json({ error: "请求格式不正确或内容过大。" }),
);
const port = Number(process.env.PORT) || 4173;
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(
    `见数 http://127.0.0.1:${port} | AI ${ready() ? "configured" : "not configured"}`,
  ),
);
