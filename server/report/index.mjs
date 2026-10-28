import { Router } from "express";
import { prepareReportBundle } from "./snapshot.mjs";
import { reportFailureMessage } from "./narrative.mjs";
import { composeReport } from "./compose.mjs";
import { renderReportPdf } from "./pdf.mjs";
export function reportRouter() {
  const router = Router();
  let active = 0;
  router.post("/", async (req, res) => {
    if (req.body?.owner && req.body.owner !== req.user.username)
      return res.status(409).json({ error: "账号已改变，请刷新后重试。" });
    if (active >= 2)
      return res.status(429).json({ error: "报告正在生成，请稍后重试。" });
    let bundle;
    try {
      bundle = prepareReportBundle(req.body);
    } catch {
      return res
        .status(400)
        .json({ error: "请先确认有效数据、指标及筛选条件。" });
    }
    active++;
    const controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 300000);
    res.on("close", () => {
      if (!res.writableEnded) controller.abort();
    });
    res.set({
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.flushHeaders();
    const emit = (e) => {
      if (!res.destroyed) res.write(JSON.stringify(e) + "\n");
    };
    try {
      emit({ type: "progress", stage: 0, text: "已核对当前数据与统计口径" });
      emit({
        type: "progress",
        stage: 1,
        text: process.env.AI_API_KEY && req.body.allowStatistical !== true
          ? "MiMo 正在撰写分析解读"
          : "正在整理统计解读",
      });
      const { snapshot, narrative } = await composeReport(bundle, {
        statistical: req.body.allowStatistical === true,
        signal: controller.signal,
        onFailure: failure => {
          console.warn("[report]", JSON.stringify({ recordId: typeof req.body.recordId === "string" ? req.body.recordId.slice(0, 64) : undefined, scope: failure.scope, kind: failure.kind, reason: failure.reason, violation: failure.violation, unsupportedTokenCount: failure.tokens?.length, attempt: failure.attempt }));
        },
        onProgress: text => emit({ type: "progress", stage: 1, text }),
      });
      if (controller.signal.aborted) return;
      if ((narrative.mode !== "ai" || narrative.questionSection && narrative.questionSection.mode !== "ai") && req.body.allowStatistical !== true) {
        emit({ type: "error", code: narrative.failureCode, error: reportFailureMessage(narrative.failureCode) });
        return;
      }
      emit({
        type: "progress",
        stage: 2,
        text:
          narrative.mode === "ai"
            ? "AI 解读已完成，正在排版 PDF"
            : "正在将统计解读排版为 PDF",
      });
      const pdf = await renderReportPdf(snapshot, narrative);
      if (controller.signal.aborted) return;
      emit({
        type: "result",
        result: {
          pdf: pdf.bytes.toString("base64"),
          pages: pdf.pages,
          title: snapshot.title,
          reportScope: "overall",
          metric: snapshot.metric.key,
          mode: narrative.mode,
          notice: narrative.notice,
          createdAt: snapshot.createdAt,
          narrative,
          questions: bundle.question?.questions || [],
          model: process.env.AI_MODEL || "mimo-v2.6-flash",
          chartCount: narrative.chapters.length + Math.min(2, narrative.questionSection?.chapters.length || 0),
          fileName:
            snapshot.title.replace(/[\\/:*?"<>|]/g, "_") + "-分析报告.pdf",
        },
      });
    } catch {
      emit({
        type: "error",
        error: controller.signal.aborted
          ? "报告生成已停止或超时，请重试。"
          : "PDF 报告生成失败，请稍后重试。",
      });
    } finally {
      active--;
      clearTimeout(timer);
      res.end();
    }
  });
  return router;
}
