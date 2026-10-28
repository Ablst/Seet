import test from "node:test";
import assert from "node:assert/strict";
import { reportKeyFor, serializeReport, restoreReport } from "../src/reportState.mjs";
import { validateStoredReport } from "../server/report/storage.mjs";

const workspace = {
  dataset: { title: "测试", metrics: [{ key: "销量", unit: "杯" }], rows: [{ name: "周一", 销量: 120 }] },
  view: { groupBy: "", granularity: "none", aggregation: "auto", filters: [] },
  metricKey: "销量", chart: "bar", sort: false, messages: [{ role: "user", text: "比较销量" }],
};
test("saved report identity survives normalized records and ignores display-only traces", () => {
  const key = reportKeyFor(workspace);
  assert.match(key, /^[a-f0-9]{16}$/);
  const restored = { ...workspace, tab: "report", report: {},
    dataset: { rows: [{ 销量: 120, name: "周一" }], source: "已保存数据", metrics: workspace.dataset.metrics, title: "测试" },
    messages: [{ text: "比较销量", role: "user", trace: [{ status: "success" }] }],
  };
  assert.equal(reportKeyFor(restored), key);
  assert.notEqual(reportKeyFor({ ...workspace, messages: [{ role: "user", text: "分析收入" }] }), key);
  assert.notEqual(reportKeyFor({ ...workspace, view: { ...workspace.view, filters: [{ field: "name", op: "eq", value: "周一" }] } }), key);
  assert.notEqual(reportKeyFor({ ...workspace, dataset: { ...workspace.dataset, rows: [{ name: "周一", 销量: 121 }] } }), key);
});

const metadata = {
  title: "销量报告", metric: "销量", mode: "ai", notice: "AI 解读", pages: 3,
  createdAt: "2026-10-28T00:00:00.000Z", fileName: "销量报告.pdf", chartCount: 1,
  model: "mimo-v2.6-flash", questions: ["比较销量"],
  narrative: { mode: "ai", notice: "AI 解读", summary: "按现有数据分析", answer: "销量存在差异", findings: [], chapters: [], nextSteps: [], limitations: [] },
};
test("PDF bytes and AI narrative survive JSON storage and restore without generation", () => {
  const bytes = Uint8Array.from({ length: 100003 }, (_, i) => i % 256);
  bytes.set(new TextEncoder().encode("%PDF-1.4\n"));
  const stored = serializeReport(reportKeyFor(workspace), { ...metadata, bytes });
  const validated = validateStoredReport(JSON.parse(JSON.stringify(stored)));
  const loaded = restoreReport(validated);
  assert.deepEqual(loaded.result.bytes, bytes);
  assert.deepEqual(loaded.result.narrative, metadata.narrative);
  assert.equal(loaded.key, reportKeyFor(workspace));
  assert.equal("bytes" in validated.result, false);
  assert.equal(restoreReport(null), null);
});
test("malformed persisted reports are rejected and older records remain compatible", () => {
  assert.equal(validateStoredReport(undefined), null);
  const stored = serializeReport(reportKeyFor(workspace), { ...metadata, bytes: new TextEncoder().encode("%PDF-1.4\n%%EOF") });
  assert.throws(() => validateStoredReport({ ...stored, result: { ...stored.result, pdf: btoa("<html>invalid") } }));
  assert.throws(() => validateStoredReport({ ...stored, result: { ...stored.result, mode: "rules" } }));
  assert.equal(restoreReport({ key: stored.key, result: { pdf: "not base64" } }), null);
});
