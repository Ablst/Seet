import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runAgent } from "../server/agent.mjs";
import { buildView } from "../src/analysis.mjs";

const dataset = {
  title: "家庭用电",
  dimensions: [{ key: "日期", type: "date" }, { key: "家庭编号", type: "text" }],
  metrics: [{ key: "用电量", unit: "kWh" }],
  rows: [
    { name: "1", 日期: "2025-01-01", 家庭编号: "H007", 用电量: 10 },
    { name: "2", 日期: "2025-02-01", 家庭编号: "H007", 用电量: 20 },
    { name: "3", 日期: "2025-01-01", 家庭编号: "H008", 用电量: 100 },
  ],
};
const call = (name, args) => ({ id: "call_" + name, type: "function", function: { name, arguments: JSON.stringify(args) } });
async function withModel(t, reply) {
  const previous = { AI_BASE_URL: process.env.AI_BASE_URL, AI_API_KEY: process.env.AI_API_KEY, AI_MODEL: process.env.AI_MODEL };
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const message = reply(JSON.parse(raw));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: "test", object: "chat.completion", created: 1, model: "mimo-v2.6-flash", choices: [{ index: 0, finish_reason: message.tool_calls ? "tool_calls" : "stop", message: { role: "assistant", ...message } }], usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 } }));
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  Object.assign(process.env, { AI_BASE_URL: `http://127.0.0.1:${server.address().port}/v1`, AI_API_KEY: "mock", AI_MODEL: "mimo-v2.6-flash" });
  t.after(() => { server.close(); for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
}

test("a text-only success claim never becomes a successful agent answer", async t => {
  await withModel(t, () => ({ content: "已筛选 H007 并切换为折线图。" }));
  const result = await runAgent({ dataset, text: "单独列出H007的月度折线图", chart: "pie" });
  assert.equal(result.changed, false);
  assert.match(result.answer, /未完成/);
  assert.doesNotMatch(result.answer, /已筛选 H007/);
});

test("completion cannot claim a view update before configuration; a subsequent chart switch preserves the household filter", async t => {
  let turn = 0;
  const requests = [];
  await withModel(t, body => {
    requests.push(body);
    const calls = [
      call("complete_response", { intent: "modify_view", answer: "已筛选 H007。" }),
      call("configure_view", { groupBy: "日期", granularity: "month", filters: [{ field: "家庭编号", op: "eq", value: "H007" }], chart: "pie" }),
      call("complete_response", { intent: "modify_view", answer: "已筛选 H007，按月生成饼图。" }),
      call("configure_view", { chart: "line" }),
      call("complete_response", { intent: "modify_view", answer: "已保留 H007 筛选并切换折线图。" }),
    ];
    const next = calls[turn++];
    return next ? { content: null, tool_calls: [next] } : { content: "已完成" };
  });
  const first = await runAgent({ dataset, text: "单独列出H007的月度饼状图", history: [{ role: "assistant", text: "已保留H007筛选" }] });
  assert.equal(first.changed, true);
  assert.equal(first.chart, "pie");
  assert.equal(first.view.filters[0].value, "H007");
  assert.equal(buildView(dataset, first.view).rows.reduce((sum, r) => sum + r.用电量, 0), 30);
  const second = await runAgent({ dataset, ...first, text: "改成折线图" });
  assert.equal(second.chart, "line");
  assert.deepEqual(second.view.filters, first.view.filters);
  assert.equal(requests.length, 5);
  assert.ok(requests.every(r => r.tool_choice === "required"));
  assert.equal(requests[0].messages.filter(m => m.role === "assistant").length, 0);
  const context = JSON.parse(requests[0].messages.find(m => m.role === "user").content);
  assert.equal(context.conversationContext[0].content, "已保留H007筛选");
  assert.deepEqual(context.state.view.filters, []);
  assert.match(JSON.stringify(requests[1].messages), /尚未执行/);
});

test("failed household selection cannot silently broaden to all data on retry", async t => {
  let turn = 0;
  const requests = [];
  await withModel(t, body => {
    requests.push(body);
    const calls = [
      call("configure_view", { groupBy: "日期", granularity: "month", filters: [{ field: "家庭编号", op: "eq", value: "H007,H008" }], chart: "line" }),
      call("configure_view", { filters: [], chart: "line" }),
      call("configure_view", { chart: "line" }),
      call("configure_view", { groupBy: "日期", granularity: "month", filters: [{ field: "家庭编号", op: "in", value: ["H007", "H008"] }], chart: "line" }),
      call("complete_response", { intent: "modify_view", answer: "已合并所选两户月度用电量并生成折线图。" }),
    ];
    const next = calls[turn++];
    return next ? { content: null, tool_calls: [next] } : { content: "已完成" };
  });
  const result = await runAgent({ dataset, view: { groupBy: "日期", granularity: "month", aggregation: "sum", filters: [{ field: "家庭编号", op: "eq", value: "H007" }] }, text: "把H007和H008月度用电相加，转换成折线图" });
  assert.equal(result.chart, "line");
  assert.equal(result.view.filters[0].op, "in");
  assert.deepEqual(result.view.filters[0].value, ["H007", "H008"]);
  assert.equal(result.trace[1].status, "error");
  assert.match(result.trace[1].summary, /不能.*筛选/);
  assert.equal(result.trace[2].status, "error");
  assert.equal(result.trace[3].status, "success");
});
