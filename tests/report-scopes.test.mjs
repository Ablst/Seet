import test from "node:test";
import assert from "node:assert/strict";
import * as snapshots from "../server/report/snapshot.mjs";
import { fallbackNarrative } from "../server/report/narrative.mjs";
import { renderReportPdf } from "../server/report/pdf.mjs";
import { serializeReport, restoreReport } from "../src/reportState.mjs";
import { validateStoredReport } from "../server/report/storage.mjs";
import { composeReport } from "../server/report/compose.mjs";

const input = {
  dataset: {
    title: "家庭用电",
    dimensions: [{ key: "日期", type: "date" }, { key: "家庭编号", type: "text" }],
    metrics: [{ key: "用电量", unit: "kWh" }],
    rows: [
      { name: "一", 日期: "2025-01-01", 家庭编号: "H007", 用电量: 10 },
      { name: "二", 日期: "2025-02-01", 家庭编号: "H007", 用电量: 20 },
      { name: "三", 日期: "2025-01-01", 家庭编号: "H008", 用电量: 100 },
    ],
  },
  view: { groupBy: "日期", granularity: "month", aggregation: "sum", filters: [{ field: "家庭编号", op: "eq", value: "H007" }] },
  metricKey: "用电量", chart: "pie",
  history: [{ role: "user", text: "只看H007的月度用电量" }],
};

test("whole-dataset report and question evidence have independent scopes without changing the workbench", () => {
  const before = structuredClone(input);
  const bundle = snapshots.prepareReportBundle(input);
  assert.equal(bundle.overall.reportScope, "overall");
  assert.equal(bundle.overall.statistics.total, 130);
  assert.deepEqual(bundle.overall.view.filters, []);
  assert.deepEqual(bundle.overall.questions, []);
  assert.equal(bundle.question.reportScope, "question");
  assert.equal(bundle.question.statistics.total, 30);
  assert.deepEqual(bundle.question.view.filters, input.view.filters);
  assert.deepEqual(input, before);
  assert.equal(snapshots.prepareReportBundle({ ...input, history: [] }).question, null);
});

test("question-specific material adds at most two PDF pages and survives saved-report round trip", async () => {
  const { overall, question } = snapshots.prepareReportBundle(input);
  const main = fallbackNarrative(overall);
  const focused = fallbackNarrative(question);
  const original = await renderReportPdf(overall, main);
  const composed = await composeReport({ overall, question }, { statistical: true });
  const narrative = composed.narrative;
  const combined = await renderReportPdf(composed.snapshot, narrative);
  assert.equal(combined.pages - original.pages, Math.min(2, focused.chapters.length));
  const stored = validateStoredReport(serializeReport("abcdef0123456789", {
    bytes: combined.bytes, title: overall.title, metric: overall.metric.key, mode: "rules",
    notice: main.notice, createdAt: overall.createdAt, fileName: "report.pdf", pages: combined.pages,
    chartCount: main.chapters.length + Math.min(2, focused.chapters.length), model: "mimo-v2.6-flash",
    questions: question.questions, narrative,
  }));
  assert.equal(restoreReport(stored).result.narrative.questionSection.answer, focused.answer);
});
