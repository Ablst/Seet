import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
test("native agent executes tools, observes results, and returns the actual monthly chart state", async (t) => {
  const { runAgent } = await import("../server/agent.mjs");
  const requests = [];
  let count = 0;
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const part of req) raw += part;
    const body = JSON.parse(raw);
    requests.push(body);
    const calls =
      count++ === 0
        ? [
            {
              id: "call_1",
              type: "function",
              function: {
                name: "configure_view",
                arguments: JSON.stringify({
                  groupBy: "日期",
                  granularity: "month",
                  aggregation: "sum",
                  metric: "用电量",
                  chart: "pie",
                  sort: "original",
                  filters: [],
                }),
              },
            },
          ]
        : [{
            id: "call_finish",
            type: "function",
            function: {
              name: "complete_response",
              arguments: JSON.stringify({
                intent: "clarify",
                answer: "已按月汇总并绘制12个月的用电饼图。",
              }),
            },
          }];
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        id: "mock",
        object: "chat.completion",
        created: 1,
        model: "mimo-v2.6-flash",
        choices: [
          {
            index: 0,
            finish_reason: calls ? "tool_calls" : "stop",
            message: {
              role: "assistant",
              content: calls ? null : "已按月汇总并绘制12个月的用电饼图。",
              ...(calls ? { tool_calls: calls } : {}),
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  process.env.AI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.AI_API_KEY = "mock";
  process.env.AI_MODEL = "mimo-v2.6-flash";
  const dataset = {
    title: "用电",
    dimensions: [
      { key: "日期", type: "date" },
      { key: "家庭", type: "text" },
    ],
    metrics: [{ key: "用电量", unit: "kWh" }],
    rows: Array.from({ length: 7300 }, (_, i) => ({
      name: `记录${i}`,
      日期: `2025-${String(1 + (i % 12)).padStart(2, "0")}-01`,
      家庭: `H${i % 20}`,
      用电量: 1,
    })),
  };
  const events = [];
  const result = await runAgent({ text: "每月换成饼状图", dataset }, (e) =>
    events.push(e),
  );
  assert.equal(result.kind, "agent");
  assert.equal(result.chart, "pie");
  assert.equal(result.view.granularity, "month");
  assert.equal(result.trace[0].status, "success");
  assert.equal(requests.length, 2);
  assert.ok(requests[0].tools.length >= 4);
  assert.ok(JSON.stringify(requests[0]).length < 20000);
  const observation = requests[1].messages.find((m) => m.role === "tool");
  assert.match(observation.content, /12/);
  assert.match(observation.content, /7300/);
  assert.ok(events.some((e) => e.type === "tool-start"));
  assert.ok(events.some((e) => e.type === "tool-end"));
  count = 0;
  const rejected = await runAgent({
    text: "转换为饼图",
    dataset: {
      ...dataset,
      rows: dataset.rows.map((r) => ({ ...r, 用电量: -1 })),
    },
    chart: "bar",
  });
  assert.equal(rejected.changed, false);
  assert.equal(rejected.chart, "bar");
  assert.equal(rejected.trace[0].status, "error");
  assert.match(rejected.answer, /操作未完成/);
});
