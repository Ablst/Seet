import test from "node:test";
import assert from "node:assert/strict";
import * as analysis from "../src/analysis.mjs";

const data = {
  title: "多户测试", dimensions: [{ key: "日期", type: "date" }, { key: "家庭编号", type: "text" }],
  metrics: [{ key: "用电量", unit: "kWh" }],
  rows: [
    { name: "一", 日期: "2025-01-01", 家庭编号: "H001", 用电量: 10 },
    { name: "二", 日期: "2025-01-01", 家庭编号: "H007", 用电量: 20 },
    { name: "三", 日期: "2025-02-01", 家庭编号: "H008", 用电量: 30 },
    { name: "四", 日期: "2025-01-01", 家庭编号: "H009", 用电量: 1000 },
  ],
};
test("membership matches any selected household, combines with other fields, and shares raw rows with chart aggregation", () => {
  const view = { groupBy: "日期", granularity: "month", aggregation: "sum", filters: [{ field: "家庭编号", op: "in", value: ["H007", "H001", "H008"] }] };
  const before = structuredClone(data);
  const grouped = analysis.buildView(data, view);
  assert.deepEqual(grouped.rows.map(r => r.用电量), [30, 30]);
  const raw = analysis.filterSource(data, view);
  assert.equal(raw.rows.length, 3);
  assert.deepEqual(new Set(raw.rows.map(r => r.家庭编号)), new Set(["H001", "H007", "H008"]));
  assert.equal(analysis.filterSource(data, { ...view, filters: [...view.filters, { field: "日期", op: "gte", value: "2025-02-01" }] }).rows.length, 1);
  assert.equal(analysis.filterSource(data, { ...view, filters: [] }).rows.length, 4);
  assert.deepEqual(data, before);
  assert.throws(() => analysis.validateView(data, { ...view, filters: [{ field: "家庭编号", op: "in", value: [] }] }));
  assert.throws(() => analysis.validateView(data, { ...view, filters: [{ field: "家庭编号", op: "eq", value: ["H001"] }] }));
});
