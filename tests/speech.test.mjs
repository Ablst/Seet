import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";

test("microphone PCM becomes real mono 16kHz WAV with clipped samples", async () => {
  const { encodeWav } = await import("../src/voice.mjs");
  const bytes = encodeWav([Float32Array.from([0, 1, -1, 2])], 16000);
  const view = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "RIFF");
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), 16000);
  assert.equal(view.getUint32(40, true), 8);
  assert.equal(view.getInt16(46, true), 32767);
  assert.equal(view.getInt16(48, true), -32768);
  assert.equal(view.getInt16(50, true), 32767);
  const down = encodeWav(
    [new Float32Array(48000), new Float32Array(48000)],
    48000,
  );
  assert.equal(down.byteLength, 32044);
});
test("speech endpoint uses MiMo ASR protocol and returns transcription without chat actions", async (t) => {
  const { transcribeAudio } = await import("../server/speech.mjs");
  const { encodeWav } = await import("../src/voice.mjs");
  let request,
    status = 200;
  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    request = JSON.parse(raw);
    res.setHeader("Content-Type", "application/json");
    res.statusCode = status;
    res.end(
      JSON.stringify(
        status === 200
          ? {
              choices: [
                {
                  finish_reason: "stop",
                  message: { content: "按门店汇总营业额。" },
                },
              ],
            }
          : { error: { message: "private provider text" } },
      ),
    );
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  process.env.AI_BASE_URL = `http://127.0.0.1:${server.address().port}/v1`;
  process.env.AI_API_KEY = "mock-speech-key";
  const audio =
    "data:audio/wav;base64," +
    Buffer.from(encodeWav([new Float32Array(16000)], 16000)).toString("base64");
  const result = await transcribeAudio(audio);
  assert.equal(result.text, "按门店汇总营业额。");
  assert.equal(request.model, "mimo-v2.5-asr");
  assert.equal(request.messages[0].content[0].input_audio.data, audio);
  assert.equal(request.asr_options.language, "auto");
  await assert.rejects(
    () => transcribeAudio("data:audio/wav;base64,invalid"),
    /录音/,
  );
  status = 401;
  await assert.rejects(() => transcribeAudio(audio), /认证/);
});
