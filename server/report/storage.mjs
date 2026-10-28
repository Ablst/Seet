import { z } from "zod";

const text = max => z.string().max(max);
const evidence = z.array(text(80)).max(128).default([]);
const mode = z.enum(["ai", "rules"]);
const narrativeSection = z.object({
  mode, notice: text(1500), summary: text(3000), answer: text(6000),
  findings: z.array(z.object({ headline: text(200), explanation: text(3000), evidence, chartIds: z.array(text(30)).max(10).optional() })).max(12),
  chapters: z.array(z.object({ title: text(200), analysis: text(6000), chartId: text(30), evidence })).max(12),
  nextSteps: z.array(text(2000)).max(16), limitations: z.array(text(2000)).max(16),
});
const narrative = narrativeSection.extend({ questionSection: narrativeSection.optional() });
const schema = z.object({
  key: z.string().regex(/^[a-f0-9]{16}$/),
  result: z.object({
    pdf: z.string().min(12).max(4 * 1024 * 1024).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    title: text(200), metric: text(80), mode, notice: text(1500),
    reportScope: z.literal("overall").optional(),
    createdAt: z.string().datetime(), fileName: text(300),
    pages: z.number().int().min(1).max(200),
    chartCount: z.number().int().min(0).max(12),
    model: text(150), questions: z.array(text(1200)).max(6), narrative,
  }),
});
export function validateStoredReport(value) {
  if (value == null) return null;
  const report = schema.parse(value), bytes = Buffer.from(report.result.pdf, "base64");
  if (bytes.subarray(0, 5).toString() !== "%PDF-" || bytes.toString("base64") !== report.result.pdf || report.result.mode !== report.result.narrative.mode)
    throw new Error("invalid saved report");
  return report;
}
