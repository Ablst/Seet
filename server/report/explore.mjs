import { summarize } from "../../src/data.mjs";
import { aggregationFor, buildView, dimensionsFor } from "../../src/analysis.mjs";

export const isAdditive = (metric, mode = "sum") =>
  mode === "sum" && !/率|比|均|温|满意|时长|单价|ROAS/.test(metric.key);

// Every candidate is computed over the same filtered source; AI only selects IDs.
export function exploreReport(data, view, metricKey, questions = []) {
  const charts = [], facts = {};
  const metrics = [...data.metrics].sort((a, b) =>
    Number(b.key === metricKey) - Number(a.key === metricKey),
  ).slice(0, 4);
  function add(type, title, result, metric, scope, kind = "comparison") {
    const rows = result.rows.map(r => ({ name: r.name, value: r[metric.key] }));
    if (!rows.some(r => r.value !== null)) return;
    const id = "c" + (charts.length + 1), stats = summarize(result, metric.key);
    stats.leaderCount = stats.leaders.length;
    stats.leaders = stats.leaders.slice(0, 8);
    const additive = isAdditive(metric, aggregationFor(metric, view.aggregation));
    const spec = { id, type, title, metric, rows, scope, kind, additive, statistics: stats };
    charts.push(spec);
    for (const key of ["total", "average", "min", "max", "count", "missing"]) {
      if (key === "total" && !additive) continue;
      const label = { total: "合计", average: "平均值", min: "最低值", max: "最高值", count: "有效组数", missing: "缺失组数" }[key];
      facts[id + "_" + key] = { label: title + " · " + label, value: stats[key], unit: ["count", "missing"].includes(key) ? "组" : metric.unit };
    }
    if (kind === "trend") {
      const valid = rows.filter(r => r.value !== null), first = valid[0], last = valid.at(-1);
      if (valid.length > 1) {
        facts[id + "_change"] = { label: `${title} · ${first.name}至${last.name}差值`, value: last.value - first.value, unit: metric.unit };
        if (first.value > 0)
          facts[id + "_changeRate"] = { label: `${title} · 首末期变化率（基期${first.name}）`, value: (last.value - first.value) / first.value * 100, unit: "%" };
      }
    }
    return spec;
  }
  const current = buildView(data, view);
  const selected = current.metrics.find(m => m.key === metricKey) || current.metrics[0];
  add("bar", selected.key + "当前分组比较", current, selected, "沿用工作台当前筛选、分组与汇总口径");
  const dims = dimensionsFor(data), date = dims.find(d => d.type === "date");
  if (date) {
    const granularity = view.groupBy === date.key && view.granularity !== "none" ? view.granularity : "month";
    const series = buildView(data, { ...view, groupBy: date.key, granularity });
    if (series.rows.length > 1) {
      const candidate = add("line", selected.key + "时间趋势", series, series.metrics.find(m => m.key === metricKey) || series.metrics[0], `保留当前筛选；按${date.key}汇总到${{ day: "日", month: "月", year: "年" }[granularity]}，按时间先后排列`, "trend");
      if (candidate) {
        const source = buildView(data, { ...view, groupBy: "", granularity: "none" });
        const dates = [...new Set(source.rows.map(r => r[date.key]).filter(Boolean))].sort();
        const dayCounts = new Map(), prefixLength = { day: 10, month: 7, year: 4 }[granularity];
        for (const date of dates) {
          const period = date.slice(0, prefixLength);
          dayCounts.set(period, (dayCounts.get(period) || 0) + 1);
        }
        const periods = series.rows.map(row => {
          const days = dayCounts.get(row.name) || 0;
          return { name: row.name, days };
        });
        const visiblePeriods = periods.length <= 24 ? periods : [...periods.slice(0, 12), ...periods.slice(-12)];
        candidate.coverage = { start: dates[0], end: dates.at(-1), days: dates.length, periodCount: periods.length, periods: visiblePeriods };
        facts[candidate.id + "_observedDays"] = { label: "筛选范围内有记录的日期数量", value: dates.length, unit: "天" };
        for (const [i, period] of periods.entries()) {
          if (periods.length > 24 && i >= 12 && i < periods.length - 12) continue;
          facts[candidate.id + "_days" + i] = { label: period.name + "有记录的天数", value: period.days, unit: "天" };
          if (candidate.additive && period.days)
            facts[candidate.id + "_daily" + i] = { label: period.name + "按有记录日期计算的日均" + selected.key, value: candidate.rows[i].value === null ? null : candidate.rows[i].value / period.days, unit: selected.unit + "/日" };
        }
      }
    }
  }
  const questionGroups = dims.filter(d => d.type !== "date")
    .sort((a,b) => Number(questions.some(q => q.includes(b.key))) - Number(questions.some(q => q.includes(a.key)))).slice(0, 3);
  for (const dim of questionGroups) {
    const result = buildView(data, { ...view, groupBy: dim.key, granularity: "none" });
    if (result.rows.length < 2 || result.rows.length > 100) continue;
    add("bar", selected.key + "按" + (dim.key === "name" ? "分类" : dim.key) + "比较", result, selected, `保留当前筛选；按${dim.key === "name" ? "分类" : dim.key}重新汇总`);
    if (charts.length >= 6) break;
  }
  const composition = [...charts].find(c => c.additive && c.rows.length > 1 && c.rows.length <= 200 && c.rows.every(r => r.value !== null && r.value >= 0) && c.statistics.total > 0);
  if (composition) {
    const pie = add("pie", selected.key + "构成占比", { rows: composition.rows.map(r => ({ name: r.name, [selected.key]: r.value })) }, selected, composition.scope + "；各组为整体的组成部分，过多分组合并为其他", "composition");
    if (pie) for (const [i, row] of [...pie.rows].sort((a,b) => b.value - a.value).slice(0, 3).entries())
      facts[pie.id + "_share" + i] = { label: row.name + "占" + selected.key + "合计的比例", value: row.value / pie.statistics.total * 100, unit: "%" };
  }
  const valid = current.rows.map(r => r[selected.key]).filter(v => v !== null);
  if (valid.length > 1 && Math.max(...valid) !== Math.min(...valid)) {
    const min = Math.min(...valid), max = Math.max(...valid), bins = Math.min(6, Math.max(3, Math.ceil(Math.sqrt(valid.length)))), step = (max - min) / bins;
    const rows = Array.from({ length: bins }, (_, i) => ({ name: `${(min + i * step).toFixed(1)}–${(min + (i + 1) * step).toFixed(1)}${i === bins - 1 ? "（含末值）" : "（不含右端）"}`, 结果组数: 0 }));
    for (const value of valid) rows[Math.min(bins - 1, Math.floor((value - min) / step))].结果组数++;
    add("bar", selected.key + "结果分布", { rows }, { key: "结果组数", unit: "组" }, `当前分组结果按${selected.key}数值区间计数，横轴单位为${selected.unit || "原始数值"}，不是原始行频数`, "distribution");
  }
  for (const m of metrics.filter(m => m.key !== metricKey)) {
    add("bar", m.key + "关联指标观察", current, current.metrics.find(x => x.key === m.key), "相同筛选与分组，独立观察该指标；不把共同变化解释为因果关系", "secondary");
  }
  return { charts, facts };
}
