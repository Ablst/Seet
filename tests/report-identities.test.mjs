import test from "node:test";
import assert from "node:assert/strict";
import { prepareReportBundle } from "../server/report/snapshot.mjs";
import * as narrative from "../server/report/narrative.mjs";

test("known households outside the current filter are identities, not invented statistics", () => {
  const ids = ["H001", "H003", "H004", "H007", "H008", "H009", "H011", "H016", "H019"];
  const data = { title: "家庭用电", dimensions: [{ key: "家庭编号", type: "text" }], metrics: [{ key: "用电量", unit: "kWh" }], rows: ids.map((id, i) => ({ name: id, 家庭编号: id, 用电量: 100 + i })) };
  const { question } = prepareReportBundle({ dataset: data, view: { groupBy: "家庭编号", granularity: "none", aggregation: "sum", filters: [{ field: "家庭编号", op: "in", value: ["H009", "H011", "H001", "H003", "H004"] }] }, history: [{ role: "user", text: "把007 008 016 019相加" }, { role: "user", text: "把009 011 001 003 004生成饼图" }] });
  assert.ok(question.contextLabels.includes("H008"));
  assert.ok(question.contextLabels.includes("H016"));
  assert.ok(question.contextLabels.includes("H019"));
  assert.equal(question.facts.sourceDimension0Count.value, 9);
  assert.equal(question.statistics.count, 5);
  assert.deepEqual(narrative.unsupportedNumbers(question, "当前筛选未包含H007、H008、H016、H019，无法对这些家庭作比较。"), []);
  assert.ok(narrative.unsupportedNumbers(question, "最高用电量为99999kWh。").length);
  assert.ok(narrative.unsupportedNumbers(question, "H099是最高值家庭。").length);
  const total = question.statistics.total;
  assert.deepEqual(narrative.unsupportedNumbers(question, `当前合计为${total}千瓦时。`), []);
  question.facts.testAverage = { label: "结果平均值", value: 4306.25 };
  assert.deepEqual(narrative.unsupportedNumbers(question, "结果平均值约4300kWh。"), []);
  assert.ok(narrative.unsupportedNumbers(question, "结果最高值为4300kWh。").length);
});
