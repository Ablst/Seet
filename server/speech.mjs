import { Router } from "express";
function speechError(message, status = 422) {
  const error = new Error(message);
  error.status = status;
  return error;
}
function validateAudio(audio) {
  if (
    typeof audio !== "string" ||
    audio.length > 10 * 1024 * 1024 ||
    !/^data:audio\/wav;base64,[A-Za-z0-9+/]+={0,2}$/.test(audio)
  )
    throw speechError("录音格式不正确或超过大小限制，请重新录制。");
  const bytes = Buffer.from(audio.slice(audio.indexOf(",") + 1), "base64");
  if (
    bytes.length < 44 ||
    bytes.toString("ascii", 0, 4) !== "RIFF" ||
    bytes.toString("ascii", 8, 12) !== "WAVE"
  )
    throw speechError("录音不是有效的 WAV 音频，请重新录制。");
}
export async function transcribeAudio(audio, signal) {
  validateAudio(audio);
  const response = await fetch(
    (process.env.AI_BASE_URL || "https://api.xiaomimimo.com/v1").replace(
      /\/$/,
      "",
    ) + "/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_API_KEY}`,
      },
      signal: signal || AbortSignal.timeout(45000),
      body: JSON.stringify({
        model: process.env.AI_ASR_MODEL || "mimo-v2.5-asr",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "input_audio",
                input_audio: { data: audio, format: "wav" },
              },
            ],
          },
        ],
        asr_options: { language: "auto" },
        stream: false,
      }),
    },
  );
  if (!response.ok)
    throw speechError(
      {
        401: "MiMo 密钥认证失败。",
        402: "MiMo 语音识别额度不足。",
        403: "当前密钥没有语音识别模型权限。",
        404: "当前服务不支持语音识别模型。",
        429: "语音请求过于频繁或额度达到限制，请稍后重试。",
      }[response.status] || "MiMo 语音识别暂不可用，请稍后重试。",
      response.status >= 500 ? 502 : response.status,
    );
  const body = await response.json(),
    choice = body.choices?.[0],
    text = choice?.message?.content;
  if (choice?.finish_reason === "length")
    throw speechError("录音识别结果被截断，请分段录制。");
  if (typeof text !== "string" || !text.trim())
    throw speechError("没有识别到清晰语音，请再说一次。");
  if (text.length > 12000) throw speechError("识别文字过长，请分段录制。");
  return {
    text: text.trim(),
    model: process.env.AI_ASR_MODEL || "mimo-v2.5-asr",
  };
}
export function speechRouter() {
  const router = Router();
  let active = 0;
  router.post("/", async (req, res) => {
    if (req.body?.owner && req.body.owner !== req.user.username)
      return res.status(409).json({ error: "登录账号已改变，请刷新后重试。" });
    if (!process.env.AI_API_KEY)
      return res.status(503).json({ error: "MiMo 语音服务尚未配置。" });
    if (active >= 2)
      return res
        .status(429)
        .json({ error: "语音识别正在处理其他请求，请稍后重试。" });
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 45000);
    active++;
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    try {
      res.json(await transcribeAudio(req.body?.audio, controller.signal));
    } catch (error) {
      if (!res.destroyed)
        res
          .status(error.status || 502)
          .json({
            error: error.status
              ? error.message
              : controller.signal.aborted
                ? "语音识别超时，请重试。"
                : "无法连接 MiMo 语音服务，请检查网络。",
          });
    } finally {
      clearTimeout(timer);
      active--;
    }
  });
  return router;
}
