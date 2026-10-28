import { generateNarrative, fallbackNarrative } from "./narrative.mjs";

export async function composeReport(bundle, { statistical = false, signal, onFailure, onProgress = () => {} } = {}) {
  const generate = async (snapshot, label) => statistical
    ? fallbackNarrative(snapshot)
    : generateNarrative(snapshot, signal, onFailure, 0, text => onProgress(`${label}：${text}`));
  const [overall, question] = await Promise.all([
    generate(bundle.overall, "整体报告"),
    bundle.question ? generate(bundle.question, "问题专题") : null,
  ]);
  return {
    snapshot: { ...bundle.overall, questionSection: bundle.question },
    narrative: { ...overall, ...(question ? { questionSection: question, failureCode: overall.failureCode || question.failureCode } : {}) },
  };
}
