import { useEffect, useRef, useState } from "react";
import { apiRequest } from "./api.mjs";
import { recordingToWav, blobDataURL } from "./voice.mjs";

export function useVoiceInput({ owner, scope, disabled, onText }) {
  const [phase, setPhase] = useState("idle"),
    [error, setError] = useState(""),
    [seconds, setSeconds] = useState(0);
  const session = useRef(null),
    generation = useRef(0),
    receive = useRef(onText);
  receive.current = onText;
  function release(s) {
    if (!s) return;
    clearInterval(s.timer);
    s.stream?.getTracks().forEach((t) => t.stop());
  }
  function discard() {
    generation.current++;
    const s = session.current;
    session.current = null;
    s?.controller?.abort();
    if (s?.recorder) {
      s.recorder.onstop = null;
      if (s.recorder.state !== "inactive") s.recorder.stop();
    }
    release(s);
  }
  function cancel() {
    discard();
    setPhase("idle");
    setError("");
    setSeconds(0);
  }
  useEffect(() => {
    discard();
    setPhase("idle");
    setError("");
    return discard;
  }, [scope]);
  useEffect(() => {
    if (disabled) cancel();
  }, [disabled]);
  function finish() {
    const s = session.current;
    if (s?.recorder?.state === "recording") {
      setPhase("transcribing");
      s.recorder.stop();
      release(s);
    }
  }
  async function start() {
    if (disabled || ["requesting", "recording", "transcribing"].includes(phase))
      return;
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError(
        "当前环境不支持录音，请使用 localhost 或 HTTPS 下的新版 Chrome / Edge。",
      );
      setPhase("error");
      return;
    }
    const token = ++generation.current;
    setError("");
    setSeconds(0);
    setPhase("requesting");
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
        video: false,
      });
      if (token !== generation.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const mime = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find(
        (type) => MediaRecorder.isTypeSupported(type),
      );
      const recorder = new MediaRecorder(
          stream,
          mime ? { mimeType: mime } : undefined,
        ),
        s = {
          recorder,
          stream,
          chunks: [],
          controller: new AbortController(),
          started: Date.now(),
        };
      session.current = s;
      recorder.ondataavailable = (e) => {
        if (e.data.size) s.chunks.push(e.data);
      };
      recorder.onerror = () => {
        if (token === generation.current) {
          discard();
          setError("录音中断，请重新录制。");
          setPhase("error");
        }
      };
      recorder.onstop = async () => {
        release(s);
        if (token !== generation.current) return;
        setPhase("transcribing");
        try {
          const wav = await recordingToWav(
            new Blob(s.chunks, { type: recorder.mimeType }),
          );
          if (token !== generation.current) return;
          const result = await apiRequest(
            "/api/speech",
            { audio: await blobDataURL(wav), owner },
            { signal: s.controller.signal },
          );
          if (token !== generation.current) return;
          receive.current(result.text);
          setPhase("success");
        } catch (e) {
          if (token !== generation.current) return;
          setError(e.message || "语音识别失败，请重试。");
          setPhase("error");
        } finally {
          release(s);
          if (session.current === s) session.current = null;
        }
      };
      recorder.start();
      setPhase("recording");
      s.timer = setInterval(() => {
        if (token !== generation.current) return;
        const elapsed = Math.floor((Date.now() - s.started) / 1000);
        setSeconds(elapsed);
        if (elapsed >= 60) finish();
      }, 250);
    } catch (e) {
      stream?.getTracks().forEach((t) => t.stop());
      if (token !== generation.current) return;
      setPhase("error");
      setError(
        e.name === "NotAllowedError"
          ? "麦克风权限未开启，请在浏览器地址栏允许本站使用麦克风后重试。"
          : e.name === "NotFoundError"
            ? "没有检测到麦克风，请连接设备后重试。"
            : "无法开始录音，请检查麦克风是否被其他应用占用。",
      );
    }
  }
  return {
    phase,
    error,
    seconds,
    start,
    finish,
    cancel,
    active: ["requesting", "recording", "transcribing"].includes(phase),
  };
}
