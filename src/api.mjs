export async function apiRequest(url, body, options = {}) {
  let response;
  try {
    response = await fetch(url, {
      ...(body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          }),
      signal: AbortSignal.timeout(50000),
      ...options,
    });
  } catch (error) {
    throw new Error(
      error.name === "TimeoutError"
        ? "AI 响应超时，请稍后重试。"
        : "无法连接作品服务，请运行项目中的“启动见数.cmd”，再刷新页面。",
    );
  }
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("接口地址没有返回数据，请通过启动脚本打开网站。");
  const result = await response.json();
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/api/auth/"))
      window.dispatchEvent(new Event("seet:auth-expired"));
    const error = new Error(result.error || "请求未成功，请稍后重试。");
    error.status = response.status;
    throw error;
  }
  return result;
}
export async function agentRequest(body, onEvent, signal) {
  const response = await fetch("/api/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) {
    if (response.status === 401)
      window.dispatchEvent(new Event("seet:auth-expired"));
    const result = await response.json();
    throw new Error(result.error || "Agent 请求未成功。");
  }
  if (!response.headers.get("content-type")?.includes("application/x-ndjson"))
    throw new Error("Agent 服务版本未更新，请重启作品服务。");
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
      if (event.type === "result") result = event.result;
      else onEvent(event);
    }
    if (done) break;
  }
  if (!result) throw new Error("Agent 连接已中断，请重试。");
  return result;
}
