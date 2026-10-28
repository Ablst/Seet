import { summarize } from "./data.mjs";
export const dimensionsFor = (d) =>
  d?.dimensions?.length
    ? d.dimensions
    : [
        {
          key: "name",
          type: d?.rows.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.name))
            ? "date"
            : "text",
        },
      ];
export function defaultView(data) {
  const dims = dimensionsFor(data),
    group =
      dims.find((d) => d.type === "date") ||
      dims.find((d) => new Set(data.rows.map((r) => r[d.key])).size <= 30) ||
      dims[0];
  return {
    groupBy: data.rows.length > 60 ? group.key : "",
    granularity:
      data.rows.length > 60 && group.type === "date" ? "month" : "none",
    aggregation: "auto",
    filters: [],
  };
}
export function validateView(data, input = {}) {
  const dims = dimensionsFor(data),
    groupBy = input.groupBy || "";
  if (groupBy && !dims.some((d) => d.key === groupBy))
    throw new Error(`没有“${groupBy}”这个分组字段。`);
  const granularity = input.granularity || "none",
    aggregation = input.aggregation || "auto";
  if (
    !["none", "day", "month", "year"].includes(granularity) ||
    !["auto", "sum", "average", "count", "min", "max"].includes(aggregation)
  )
    throw new Error("分组或汇总方式不受支持。");
  if (
    granularity !== "none" &&
    (!groupBy || dims.find((d) => d.key === groupBy)?.type !== "date")
  )
    throw new Error("按月或按年汇总需要选择日期字段。");
  const filters = Array.isArray(input.filters) ? input.filters : [];
  if (filters.length > 6) throw new Error("最多同时使用六个筛选条件。");
  for (const f of filters)
    if (
      ![...dims, ...data.metrics].some((d) => d.key === f.field) ||
      !["eq", "in", "contains", "gte", "lte"].includes(f.op) ||
      (f.op === "in"
        ? !Array.isArray(f.value) || f.value.length < 1 || f.value.length > 100 || f.value.some(v => !["string", "number"].includes(typeof v) || typeof v === "number" && !Number.isFinite(v))
        : !["string", "number"].includes(typeof f.value))
    )
      throw new Error("筛选条件不受支持。");
  return {
    groupBy,
    granularity,
    aggregation,
    filters: filters.map((f) => ({ field: f.field, op: f.op, value: Array.isArray(f.value) ? [...f.value] : f.value })),
  };
}
export function aggregationFor(metric, mode) {
  return mode === "auto"
    ? /率|比|均|温|满意|时长|单价|ROAS/.test(metric.key)
      ? "average"
      : "sum"
    : mode;
}
export function filterSource(data, input) {
  const view = validateView(data, input || defaultView(data));
  const filtered = data.rows.filter((r) =>
    view.filters.every((f) =>
      f.op === "eq"
        ? String(r[f.field]) === String(f.value)
        : f.op === "in"
          ? f.value.some(value => String(r[f.field]) === String(value))
        : f.op === "contains"
          ? String(r[f.field] ?? "").includes(String(f.value))
          : f.op === "gte"
            ? r[f.field] != null && r[f.field] >= f.value
            : r[f.field] != null && r[f.field] <= f.value,
    ),
  );
  return { ...data, rows: filtered };
}
export function buildView(data, input) {
  const view = validateView(data, input || defaultView(data));
  const filtered = filterSource(data, view).rows;
  if (!view.groupBy) return { ...data, rows: filtered };
  const groups = new Map();
  for (const row of filtered) {
    let name = String(row[view.groupBy] ?? "未填写");
    if (view.granularity === "month") name = name.slice(0, 7);
    else if (view.granularity === "year") name = name.slice(0, 4);
    else if (view.granularity === "day") name = name.slice(0, 10);
    if (!groups.has(name))
      groups.set(
        name,
        data.metrics.map(() => ({
          sum: 0,
          count: 0,
          min: Infinity,
          max: -Infinity,
        })),
      );
    const cells = groups.get(name);
    data.metrics.forEach((m, i) => {
      const v = row[m.key];
      if (v !== null) {
        cells[i].sum += v;
        cells[i].count++;
        cells[i].min = Math.min(cells[i].min, v);
        cells[i].max = Math.max(cells[i].max, v);
      }
    });
  }
  let rows = [...groups].map(([name, cells]) =>
    Object.fromEntries([
      ["name", name],
      ...data.metrics.map((m, i) => {
        const s = cells[i],
          a = aggregationFor(m, view.aggregation);
        return [
          m.key,
          a === "count"
            ? s.count
            : !s.count
              ? null
              : a === "average"
                ? s.sum / s.count
                : a === "min"
                  ? s.min
                  : a === "max"
                    ? s.max
                    : s.sum,
        ];
      }),
    ]),
  );
  if (dimensionsFor(data).find((d) => d.key === view.groupBy)?.type === "date")
    rows.sort((a, b) => a.name.localeCompare(b.name));
  return {
    title: data.title,
    metrics: data.metrics.map((m) => ({
      ...m,
      unit: view.aggregation === "count" ? "条" : m.unit,
    })),
    rows,
  };
}
export function chartAvailability(data, key, type) {
  if (!data?.rows.length)
    return { ok: false, reason: "筛选后没有数据，请调整筛选条件。" };
  if (type !== "pie") return { ok: true };
  if (data.rows.length > 200)
    return {
      ok: false,
      reason: "饼图超过 200 类，请先按月或分类汇总后再绘图。",
    };
  if (data.rows.some((r) => r[key] === null || r[key] < 0))
    return {
      ok: false,
      reason:
        "饼图不能展示负值或缺失值。请先筛选有效数据，或选择柱状图、折线图。",
    };
  if (!data.rows.some((r) => r[key] > 0))
    return { ok: false, reason: "当前指标合计为零，无法绘制占比。" };
  return { ok: true };
}
export function dataProfile(data) {
  return {
    title: data.title,
    rowCount: data.rows.length,
    dimensions: dimensionsFor(data).map((d) => ({
      ...d,
      unique: new Set(data.rows.map((r) => r[d.key])).size,
      examples: [...new Set(data.rows.map((r) => r[d.key]))].slice(0, 8),
    })),
    metrics: data.metrics.map((m) => {
      const s = summarize(data, m.key);
      return {
        ...m,
        ...s,
        leaders: s.leaders.slice(0, 8),
        leaderCount: s.leaders.length,
        defaultAggregation: aggregationFor(m, "auto"),
      };
    }),
    samples: data.rows.slice(0, 3),
  };
}
export function qualityReport(data) {
  const seen = new Set();
  let duplicates = 0;
  for (const r of data.rows) {
    const key = JSON.stringify(r);
    if (seen.has(key)) duplicates++;
    seen.add(key);
  }
  const metrics = data.metrics.map((m) => ({
    key: m.key,
    missing: data.rows.filter((r) => r[m.key] === null).length,
    negative: data.rows.filter((r) => r[m.key] !== null && r[m.key] < 0).length,
  }));
  return {
    rows: data.rows.length,
    duplicateRows: duplicates,
    metrics,
    notes: "重复和负值仅报告，不自动删除；缺失值排除，零值参与。",
  };
}
