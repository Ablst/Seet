export async function requestReport(input, onProgress, signal) {
  const response = await fetch("/api/report", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal,
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("seet:auth-expired"));
    const data = await response.json();
    throw new Error(data.error || "报告请求失败。");
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson"))
    throw new Error("报告服务未更新，请重启作品服务。");
  const reader = response.body.getReader(),
    decoder = new TextDecoder();
  let pending = "",
    result;
  while (true) {
    const { value, done } = await reader.read();
    pending += decoder.decode(value, { stream: !done });
    const lines = pending.split("\n");
    pending = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      if (event.type === "error") throw new Error(event.error);
      if (event.type === "progress") onProgress(event);
      if (event.type === "result") result = event.result;
    }
    if (done) break;
  }
  if (!result) throw new Error("报告生成连接已中断，请重试。");
  const binary = atob(result.pdf),
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  delete result.pdf;
  return { ...result, bytes };
}
