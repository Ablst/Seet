import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { samples } from "../src/data.mjs";

test("report snapshot uses the current metric, filters and aggregate, preserving input", async () => {
  const { prepareReport } = await import("../server/report/snapshot.mjs");
  const original = JSON.stringify(samples[0]);
  const report = prepareReport({
    dataset: samples[0],
    metricKey: "收入",
    chart: "pie",
    view: {
      groupBy: "name",
      granularity: "none",
      aggregation: "sum",
      filters: [{ field: "name", op: "eq", value: "周一" }],
    },
  });
  assert.equal(report.statistics.total, 2160);
  assert.equal(report.resultRows, 1);
  assert.equal(report.rawRows, 7);
  assert.equal(report.metric.key, "收入");
  assert.equal(report.quality.rows, 7);
  assert.equal(JSON.stringify(samples[0]), original);
});
test("report narrative uses validated evidence, and falls back honestly if MiMo fails", async (t) => {
  const { prepareReport } = await import("../server/report/snapshot.mjs");
  const { generateNarrative, reportFailureMessage } = await import("../server/report/narrative.mjs");
  let status = 200, lastRequest, requests = [], chartId = "c1", streamed = false, omitPie = false, partialChapters = false, generalFinding = false, repeatedQuestionChart = false,
    summary = "销售表现存在明显差异。";
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    lastRequest = JSON.parse(raw);
    requests.push(lastRequest);
    res.statusCode = status;
    const body = {
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                summary,
                answer: "先核对用户关注的销售高峰，再从构成与分布观察差异，现有数据不足以解释原因。",
                findings: [
                  {
                    headline: "高峰集中",
                    explanation: "最高记录值得进一步核对经营背景。",
                    chartIds: ["c1"],
                    evidence: ["max", "average", "count", "rawRows"],
                  },
                ],
                nextSteps: ["结合活动安排核对高峰原因。"],
                limitations: Array.from({length: 5}, (_, i) => i ? "样本仅反映当前记录，不能证明促销对销售造成了变化。" : "需要补充的信息包括活动安排，现有数据不能解释原因。"),
                chapters: [chartId, "c3", "c4"].map((id) => ({
                  title: "销售表现的不同观察角度",
                  analysis: "根据当前筛选结果比较数据差异，并结合业务背景继续核查，描述性统计不能替代因果判断。",
                  chartId: id, evidence: ["total", "average", "max", "min", "count", "missing", "rawRows", "duplicateRows", "c1_total", "c1_average", "c1_min", "c1_max", "c1_count", "c1_missing", "c2_max", "c2_average"],
                })),
              }),
            },
          },
        ],
      };
    if (lastRequest.messages[0].content.includes("分析规划")) {
      const focused = JSON.parse(lastRequest.messages[1].content).reportPurpose?.includes("一至两页");
      body.choices[0].message.content = JSON.stringify({ focus: "围绕周末销售与备货核对高峰和分布", chartIds: focused ? [chartId, "c3"] : partialChapters ? [chartId, "c3", "c4", "c5"] : omitPie ? [chartId, "c4", "c5"] : [chartId, "c3", "c4"] });
    } else {
      const plan = JSON.parse(lastRequest.messages[1].content).validatedPlan;
      const result = JSON.parse(body.choices[0].message.content);
      result.chapters = (partialChapters ? plan.chartIds.slice(0, plan.chartIds.length - 1) : plan.chartIds).map(id => ({ ...result.chapters[0], chartId: id }));
      if (generalFinding) result.findings.push({ headline: "分析边界", explanation: "现有记录不能用于推断因果关系，应继续结合业务背景核查。", chartIds: [] });
      if (repeatedQuestionChart) result.chapters = [result.chapters[0], { ...result.chapters[0] }];
      body.choices[0].message.content = JSON.stringify(result);
    }
    if (streamed) {
      res.setHeader("Content-Type", "text/event-stream");
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { reasoning_content: "private reasoning" } }] }) + '\n\n');
      res.write('data: ' + JSON.stringify({ choices: [{ delta: { content: body.choices[0].message.content }, finish_reason: "stop" }] }) + '\n\n');
      res.end('data: [DONE]\n\n');
    } else {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    }
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  process.env.AI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.AI_API_KEY = "mock-report";
  process.env.AI_MODEL = "mimo-v2.6-flash";
  const snapshot = prepareReport({ dataset: samples[0], history: [{ role: "user", text: "周末销量是否更高，应该如何备货？" }, { role: "assistant", text: "旧的错误统计：99999杯。" }] });
  const ai = await generateNarrative(snapshot);
  assert.equal(ai.mode, "ai");
  assert.ok(requests.some(r => r.thinking.type === "enabled"));
  assert.equal(lastRequest.thinking.type, "disabled");
  assert.ok(lastRequest.messages[1].content.includes("validatedPlan"));
  assert.deepEqual(JSON.parse(lastRequest.messages[1].content).validatedPlan.chartIds, ["c1", "c2", "c3"]);
  assert.equal(lastRequest.temperature, 0);
  assert.ok(lastRequest.messages[1].content.includes("应该如何备货"));
  assert.ok(requests.every(r => !r.messages[1].content.includes("旧的错误统计")));
  assert.equal(ai.chapters.length, 3);
  assert.ok(ai.chapters[0].evidence.every(key => key in snapshot.facts));
  assert.ok(ai.chapters[0].evidence.every(key => key.startsWith(ai.chapters[0].chartId + "_")));
  assert.equal(ai.limitations.length, 5);
  streamed = true;
  const phases = [];
  assert.equal((await generateNarrative(snapshot, undefined, undefined, 0, p => phases.push(p))).mode, "ai");
  assert.ok(phases.some(p => p.includes("思考")));
  assert.ok(!phases.some(p => p.includes("private reasoning")));
  omitPie = true;
  const mixed = await generateNarrative(snapshot);
  assert.ok(mixed.chapters.some(c => snapshot.charts.find(x => x.id === c.chartId)?.type === "pie"));
  omitPie = false;
  const questionNarrative = await generateNarrative({ ...snapshot, reportScope: "question" });
  assert.equal(questionNarrative.mode, "ai");
  assert.equal(questionNarrative.chapters.length, 2);
  const latestOnly = await generateNarrative({ ...snapshot, reportScope: "question", questions: ["旧的其他家庭问题", "当前五户占比问题"], history: [{ role: "user", text: "旧的其他家庭问题" }, { role: "user", text: "当前五户占比问题" }] });
  assert.equal(latestOnly.mode, "ai");
  assert.deepEqual(JSON.parse(lastRequest.messages[1].content).questions, ["当前五户占比问题"]);
  assert.ok(!lastRequest.messages[1].content.includes("旧的其他家庭问题"));
  partialChapters = true;
  const validSubset = await generateNarrative(snapshot);
  assert.equal(validSubset.mode, "ai");
  assert.equal(validSubset.chapters.length, 3);
  assert.equal((await generateNarrative({ ...snapshot, reportScope: "question" })).chapters.length, 1);
  partialChapters = false;
  generalFinding = true;
  assert.equal((await generateNarrative(snapshot)).mode, "ai");
  generalFinding = false;
  repeatedQuestionChart = true;
  const deduplicated = await generateNarrative({ ...snapshot, reportScope: "question" });
  assert.equal(deduplicated.mode, "ai");
  assert.equal(deduplicated.chapters.length, 1);
  repeatedQuestionChart = false;
  assert.ok(ai.findings[0].evidence.every(key => key.startsWith("c1_")));
  summary = "最高销量为280杯。";
  assert.equal((await generateNarrative(snapshot)).mode, "ai");
  summary = "最高销量为99999杯。";
  assert.equal((await generateNarrative(snapshot)).mode, "rules");
  assert.ok(JSON.parse(lastRequest.messages[1].content).revision.issues.unsupportedNumbers.includes("99999"));
  snapshot.view.filters = [{ field: "家庭编号", op: "eq", value: "H00742" }];
  snapshot.rows[0].name = "2025-01";
  snapshot.rows[1].name = "2025-05";
  snapshot.contextLabels = ["H008"];
  summary = "H00742家庭在2025年5月的记录需要核查，当前筛选不包含H008。";
  assert.equal((await generateNarrative(snapshot)).mode, "ai");
  summary = "H00742家庭在2025年05月的记录需要核查，最高销量为0.028万杯。";
  assert.equal((await generateNarrative(snapshot)).mode, "ai");
  summary = "最高销量为99999万杯。";
  assert.equal((await generateNarrative(snapshot)).failureCode, "evidence");
  summary = "H00742家庭在2025年的用电量为99999。";
  assert.equal((await generateNarrative(snapshot)).failureCode, "evidence");
  summary = "销售存在差异。";
  chartId = "nonexistent";
  assert.equal((await generateNarrative(snapshot)).mode, "rules");
  status = 402;
  streamed = false;
  const fallback = await generateNarrative(snapshot);
  assert.equal(fallback.mode, "rules");
  assert.equal(fallback.failureCode, "quota");
  assert.match(reportFailureMessage(fallback.failureCode), /额度不足/);
  assert.ok(fallback.notice);
  assert.ok(fallback.findings.length);
});
test("report PDF is a paginated document with a bounded appendix", async () => {
  const { prepareReport } = await import("../server/report/snapshot.mjs");
  const { fallbackNarrative } = await import("../server/report/narrative.mjs");
  const { renderReportPdf } = await import("../server/report/pdf.mjs");
  const snapshot = prepareReport({ dataset: samples[0], chart: "pie" }),
    narrative = fallbackNarrative(snapshot);
  const result = await renderReportPdf(snapshot, narrative);
  assert.equal(result.bytes.subarray(0, 5).toString(), "%PDF-");
  assert.ok(result.pages >= 6 && result.pages <= 12);
  assert.ok(result.bytes.length > 10000);
});

test("deep report retains questions and computes distinct chart evidence within filters", async () => {
  const { prepareReport } = await import("../server/report/snapshot.mjs");
  const dataset = {
    title: "分馆客流",
    dimensions: [{ key: "日期", type: "date" }, { key: "分馆", type: "text" }],
    metrics: [{ key: "入馆人数", unit: "人" }, { key: "借阅数", unit: "册" }],
    rows: [
      { name: "一", 日期: "2026-01-01", 分馆: "东馆", 入馆人数: 10, 借阅数: 3 },
      { name: "二", 日期: "2026-02-01", 分馆: "东馆", 入馆人数: 20, 借阅数: 5 },
      { name: "三", 日期: "2026-01-01", 分馆: "西馆", 入馆人数: 900, 借阅数: 800 },
    ],
  };
  const report = prepareReport({ dataset, metricKey: "入馆人数", history: [
    { role: "user", text: "只看东馆，说明逐月变化和借阅表现" },
    { role: "assistant", text: "已筛选东馆", trace: [{ secret: true }] },
  ], view: { groupBy: "日期", granularity: "month", aggregation: "sum", filters: [{ field: "分馆", op: "eq", value: "东馆" }] } });
  assert.equal(report.questions[0], "只看东馆，说明逐月变化和借阅表现");
  assert.equal(report.history[1].trace, undefined);
  assert.ok(report.charts.some(c => c.type === "line"));
  assert.ok(report.charts.some(c => c.type === "pie"));
  assert.ok(report.charts.some(c => c.metric.key === "借阅数"));
  const trend = report.charts.find(c => c.type === "line");
  assert.deepEqual(trend.rows.map(r => r.value), [10, 20]);
  assert.equal(trend.coverage.days, 2);
  assert.equal(trend.coverage.end, "2026-02-01");
  assert.ok(!report.charts.some(c => c.rows.some(r => r.value === 900)));
  assert.ok(Object.keys(report.facts).some(k => k.startsWith(trend.id + "_")));
});

test("rate and negative series do not produce misleading composition pies", async () => {
  const { prepareReport } = await import("../server/report/snapshot.mjs");
  const report = prepareReport({ dataset: { title: "质量数据", metrics: [{ key: "转化率", unit: "%" }], rows: [{ name: "A", 转化率: 20 }, { name: "B", 转化率: -2 }] } });
  assert.ok(!report.charts.some(c => c.type === "pie"));
  assert.ok(report.charts.some(c => c.type === "bar"));
});
