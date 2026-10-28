// A stable cache identity, not an authentication token. Keep large datasets out
// of the stored key, and ignore object insertion order and execution traces.
export function reportKeyFor(workspace) {
  const data = workspace.dataset, dimensions = data?.dimensions || [], metrics = data?.metrics || [];
  const view = workspace.view ? [workspace.view.groupBy || "", workspace.view.granularity || "none", workspace.view.aggregation || "auto", (workspace.view.filters || []).map(f => [f.field, f.op, f.value])] : null;
  const content = JSON.stringify([
    "overall-report-with-question-section-v1",
    data ? [data.title, data.source?.slice(0, 300) || "已保存数据", metrics.map(m => [m.key, m.unit || ""]), dimensions.map(d => [d.key, d.type]), data.rows.map(r => [r.name, ...dimensions.map(d => r[d.key]), ...metrics.map(m => r[m.key])])] : null,
    view, workspace.metricKey || "", workspace.chart, workspace.sort === true,
    (workspace.messages || []).slice(-12).map(m => [m.role, m.text.slice(0, 1200)]),
  ]);
  let first = 2166136261, second = 3339675911;
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 2246822519);
  }
  return (first >>> 0).toString(16).padStart(8, "0") + (second >>> 0).toString(16).padStart(8, "0");
}

export function serializeReport(key, result) {
  const { bytes, ...metadata } = result;
  let binary = "";
  for (let i = 0; i < bytes.length; i += 16384)
    binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return { key, result: { ...metadata, pdf: btoa(binary) } };
}

export function restoreReport(stored) {
  if (!stored?.result?.pdf || typeof stored.key !== "string") return null;
  try {
    const { pdf, ...metadata } = stored.result;
    const binary = atob(pdf);
    if (!binary.startsWith("%PDF-")) return null;
    return { key: stored.key, result: { ...metadata, bytes: Uint8Array.from(binary, c => c.charCodeAt(0)) } };
  } catch {
    return null;
  }
}
