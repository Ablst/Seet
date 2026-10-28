import { validateDataset, summarize } from "../../src/data.mjs";
import { exploreReport } from "./explore.mjs";
import {
  buildView,
  defaultView,
  validateView,
  qualityReport,
  aggregationFor,
  chartAvailability,
  dimensionsFor,
} from "../../src/analysis.mjs";

export function prepareReportBundle(input) {
  const data = validateDataset(input?.dataset);
  const overall = prepareReport({ ...input, view: defaultView(data), chart: "bar", sort: false, history: [] });
  overall.reportScope = "overall";
  const focused = prepareReport(input);
  const question = focused.questions.length ? { ...focused, reportScope: "question" } : null;
  return { overall, question };
}

export function prepareReport(input) {
  const data = validateDataset(input?.dataset),
    view = validateView(data, input.view || defaultView(data));
  const metric =
    data.metrics.find((m) => m.key === input.metricKey) || data.metrics[0];
  const result = buildView(data, view);
  let rows = result.rows;
  if (input.sort)
    rows = [...rows].sort(
      (a, b) => (b[metric.key] ?? -Infinity) - (a[metric.key] ?? -Infinity),
    );
  const statistics = summarize(result, metric.key);
  statistics.leaderCount = statistics.leaders.length;
  statistics.leaders = statistics.leaders.slice(0, 8);
  const chart = ["bar", "line", "pie"].includes(input.chart)
      ? input.chart
      : "bar",
    availability = chartAvailability(result, metric.key, chart);
  const aggregation = aggregationFor(metric, view.aggregation),
    additive =
      (view.groupBy ? aggregation === "sum" : true) &&
      !/率|比|均|温|满意|单价|ROAS/.test(metric.key);
  const snapshot = {
    title: data.title,
    source:
      typeof input.dataset.source === "string"
        ? input.dataset.source.slice(0, 300)
        : "当前工作台数据",
    createdAt: new Date().toISOString(),
    rawRows: data.rows.length,
    resultRows: rows.length,
    metric: result.metrics.find((m) => m.key === metric.key),
    view,
    chart,
    sort: input.sort === true,
    aggregation,
    additive,
    statistics,
    quality: qualityReport(data),
    chartAvailable: availability.ok,
    chartNotice: availability.reason || "",
    rows: rows.map((r) => ({ name: r.name, value: r[metric.key] })),
  };
  snapshot.facts = {
    sourceMetricCount: { label: "原始数据指标数量", value: data.metrics.length, unit: "项" },
    sourceDimensionCount: { label: "原始数据分类字段数量", value: dimensionsFor(data).length, unit: "项" },
    total: {
      label: additive ? "合计" : "结果数值合计（不作为业务总量）",
      value: statistics.total,
    },
    average: { label: "结果平均值", value: statistics.average },
    max: { label: "最高值", value: statistics.max, names: statistics.leaders },
    min: { label: "最低值", value: statistics.min },
    count: { label: "有效结果数", value: statistics.count },
    missing: { label: "当前视图缺失值", value: statistics.missing },
    rawRows: { label: "原始记录数", value: data.rows.length },
    duplicateRows: {
      label: "完全重复原始记录",
      value: snapshot.quality.duplicateRows,
    },
  };
  for (const [index, dimension] of dimensionsFor(data).entries())
    snapshot.facts[`sourceDimension${index}Count`] = { label: `原始数据中${dimension.key}的不同取值数量`, value: new Set(data.rows.map(row => row[dimension.key])).size, unit: "类" };
  snapshot.history = (Array.isArray(input.history) ? input.history : [])
    .filter(m => ["user", "assistant"].includes(m?.role) && typeof m.text === "string")
    .slice(-12).map(m => ({ role: m.role, text: m.text.slice(0, 1200) }));
  snapshot.questions = snapshot.history.filter(m => m.role === "user").map(m => m.text).slice(-6);
  // IDs from low-cardinality source dimensions remain real identities even
  // outside the current filter or when the user omits their alphabetic prefix.
  // They may be named in scope explanations, but their statistics are not added.
  const questionText = snapshot.questions.join("\n");
  snapshot.contextLabels = [...new Set(dimensionsFor(data).flatMap(d => {
    const values = [...new Set(data.rows.map(r => r[d.key]))];
    return values.filter(v => typeof v === "string" && /\d/.test(v) && /[^\d.,+-]/.test(v) && v.length > 1 && (
      questionText.includes(v) || d.type === "text" && values.length <= 100 && /^[A-Za-z]+\d+$/.test(v)
    ));
  }))].slice(0, 200);
  const exploration = exploreReport(data, view, metric.key, snapshot.questions);
  snapshot.charts = exploration.charts;
  Object.assign(snapshot.facts, exploration.facts);
  return snapshot;
}
