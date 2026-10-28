import { Router } from "express";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { validateDataset } from "../src/data.mjs";
import { validateView } from "../src/analysis.mjs";
import { validateStoredReport } from "./report/storage.mjs";

function validateWorkspace(value) {
  if (!value || !Array.isArray(value.messages) || value.messages.length > 100)
    throw new Error("invalid workspace");
  const dataset = (d) =>
    d
      ? {
          ...validateDataset(d),
          source:
            typeof d.source === "string"
              ? d.source.slice(0, 300)
              : "已保存数据",
        }
      : null;
  const messages = value.messages.map((m) => {
    if (
      !["user", "assistant"].includes(m?.role) ||
      typeof m.text !== "string" ||
      m.text.length > 12000
    )
      throw new Error("invalid message");
    const trace = Array.isArray(m.trace)
      ? m.trace
          .slice(0, 30)
          .filter(
            (e) => typeof e.label === "string" && typeof e.summary === "string",
          )
          .map((e) => ({
            id: String(e.id).slice(0, 40),
            tool: String(e.tool).slice(0, 60),
            label: e.label.slice(0, 100),
            summary: e.summary.slice(0, 1000),
            status: e.status === "success" ? "success" : "error",
          }))
      : [];
    return { role: m.role, text: m.text, ...(trace.length ? { trace } : {}) };
  });
  return {
    dataset: dataset(value.dataset),
    draft: dataset(value.draft),
    view:
      (value.draft || value.dataset) && value.view
        ? validateView(value.draft || value.dataset, value.view)
        : null,
    messages,
    chart: ["bar", "line", "pie"].includes(value.chart) ? value.chart : "bar",
    metricKey:
      typeof value.metricKey === "string" ? value.metricKey.slice(0, 40) : "",
    tab: ["chart", "data", "report"].includes(value.tab) ? value.tab : "chart",
    sort: value.sort === true,
    report: validateStoredReport(value.report),
  };
}
export function recordsRouter() {
  const router = Router(),
    queues = new Map();
  router.use((req, res, next) => {
    let expected;
    try {
      expected = decodeURIComponent(req.get("X-Workspace-Owner") || "");
    } catch {
      return res.status(400).json({ error: "账号请求格式不正确。" });
    }
    if (expected && expected !== req.user.username)
      return res
        .status(409)
        .json({ error: "登录账号已改变，请刷新页面后继续。" });
    next();
  });
  const root =
    process.env.ANALYSIS_STORE ||
    fileURLToPath(new URL("../.data/analyses", import.meta.url));
  const fileFor = (user) =>
    path.join(
      root,
      createHash("sha256").update(user.username.toLowerCase()).digest("hex") +
        ".json",
    );
  async function read(file) {
    try {
      return JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") return [];
      throw e;
    }
  }
  router.get("/", async (req, res) => {
    try {
      const records = await read(fileFor(req.user));
      res.json({
        records: records
          .filter((r) => !r.deletedAt)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map(({ id, title, updatedAt, workspace }) => ({
            id,
            title,
            updatedAt,
            rows: (workspace.dataset || workspace.draft)?.rows.length || 0,
            metrics:
              (workspace.dataset || workspace.draft)?.metrics.length || 0,
          })),
      });
    } catch {
      res.status(500).json({ error: "无法读取分析记录，请稍后重试。" });
    }
  });
  router.get("/:id", async (req, res) => {
    try {
      const record = (await read(fileFor(req.user))).find(
        (r) => r.id === req.params.id,
      );
      if (!record || record.deletedAt)
        return res
          .status(404)
          .json({ error: "没有找到该账号的这条分析记录。" });
      res.json({ record });
    } catch {
      res.status(500).json({ error: "无法打开分析记录。" });
    }
  });
  async function changeVisibility(req, res, restore) {
    if (req.body?.owner && req.body.owner !== req.user.username)
      return res.status(409).json({ error: "登录账号已改变，请刷新后重试。" });
    const file = fileFor(req.user);
    const operation = (queues.get(file) || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const records = await read(file),
          record = records.find((r) => r.id === req.params.id);
        if (!record || (!restore && record.deletedAt)) {
          const e = new Error("没有找到该账号的这条记录。");
          e.status = 404;
          throw e;
        }
        if (restore) delete record.deletedAt;
        else record.deletedAt = new Date().toISOString();
        await writeFile(file + ".tmp", JSON.stringify(records), {
          mode: 0o600,
        });
        await rename(file + ".tmp", file);
        return { id: record.id, title: record.title };
      });
    queues.set(
      file,
      operation.catch(() => {}),
    );
    try {
      res.json(await operation);
    } catch (e) {
      res
        .status(e.status || 500)
        .json({ error: e.status ? e.message : "记录操作失败，请重试。" });
    }
  }
  router.delete("/:id", (req, res) => changeVisibility(req, res, false));
  router.post("/:id/restore", (req, res) => changeVisibility(req, res, true));
  router.put("/:id", async (req, res) => {
    if (req.body?.owner && req.body.owner !== req.user.username)
      return res
        .status(409)
        .json({ error: "登录账号已改变，请刷新页面后重试。" });
    if (!/^[a-f0-9-]{36}$/i.test(req.params.id))
      return res.status(400).json({ error: "分析记录编号无效。" });
    let workspace;
    try {
      workspace = validateWorkspace(req.body?.workspace);
    } catch {
      return res
        .status(400)
        .json({ error: "分析内容格式不正确，请完成数据核对后重试保存。" });
    }
    const file = fileFor(req.user);
    const operation = (queues.get(file) || Promise.resolve())
      .catch(() => {})
      .then(async () => {
        const records = await read(file),
          index = records.findIndex((r) => r.id === req.params.id);
        if (index >= 0 && records[index].deletedAt) {
          const e = new Error("deleted");
          e.deleted = true;
          throw e;
        }
        if (index < 0 && records.filter((r) => !r.deletedAt).length >= 200) {
          const e = new Error("limit");
          e.limit = true;
          throw e;
        }
        const title =
          (workspace.dataset || workspace.draft)?.title ||
          workspace.messages
            .find((m) => m.role === "user")
            ?.text.slice(0, 40) ||
          "新的分析";
        const record = {
          id: req.params.id,
          title,
          updatedAt: new Date().toISOString(),
          workspace,
        };
        if (index < 0) records.push(record);
        else records[index] = record;
        await mkdir(root, { recursive: true });
        await writeFile(file + ".tmp", JSON.stringify(records), {
          mode: 0o600,
        });
        await rename(file + ".tmp", file);
        return record;
      });
    queues.set(
      file,
      operation.catch(() => {}),
    );
    try {
      const record = await operation;
      res.json({
        id: record.id,
        updatedAt: record.updatedAt,
        title: record.title,
      });
    } catch (e) {
      res.status(e.limit || e.deleted ? 409 : 500).json({
        error: e.deleted
          ? "这条记录已删除，请新建分析或撤销删除。"
          : e.limit
            ? "当前账号已达到 200 条分析记录上限。"
            : "保存失败，当前内容仍在页面中，请重试。",
      });
    }
  });
  return router;
}
