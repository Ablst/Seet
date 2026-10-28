import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { runAI } from "../server/ai.mjs";
test("agent includes draft and conversation context and executes validated chart plans", async (t) => {
  let request,
    output = {
      kind: "actions",
      actions: [
        { tool: "select_metric", value: "到场" },
        { tool: "set_chart", value: "pie" },
      ],
    };
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    request = JSON.parse(raw);
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: JSON.stringify(output) },
          },
        ],
      }),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  process.env.AI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.AI_API_KEY = "mock-only";
  process.env.AI_MODEL = "mimo-v2.6-flash";
  const draft = {
    title: "社团",
    metrics: [{ key: "到场", unit: "人" }],
    rows: [
      { name: "甲", 到场: 10 },
      { name: "乙", 到场: 20 },
    ],
  };
  const input = {
    text: "转换成饼状图",
    draft,
    history: [{ role: "user", text: "刚才的社团数据" }],
  };
  const result = await runAI(input, true);
  assert.equal(result.kind, "actions");
  assert.equal(result.actions[1].value, "pie");
  assert.match(request.messages.at(-1).content, /30/);
  assert.match(JSON.stringify(request.messages), /刚才的社团数据/);
  output = {
    kind: "actions",
    actions: [{ tool: "select_metric", value: "不存在" }],
  };
  await assert.rejects(() => runAI(input, true));
  output = {
    kind: "actions",
    actions: [{ tool: "eval", value: "process.env" }],
  };
  await assert.rejects(() => runAI(input, true));
  output = { kind: "actions", actions: [{ tool: "set_chart", value: "pie" }] };
  const empty = await runAI({ text: "转换成饼状图" }, true);
  assert.equal(empty.kind, "answer");
  assert.match(empty.answer, /数据/);
});
