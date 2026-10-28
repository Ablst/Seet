import PDFDocument from "pdfkit";
import { fileURLToPath } from "node:url";
const font = fileURLToPath(
  new URL("../../assets/fonts/NotoSansCJKsc-Regular.otf", import.meta.url),
);
const c = {
  ink: "#26372e",
  muted: "#657067",
  green: "#2f7151",
  line: "#dfe6df",
  white: "#ffffff",
  chart: [
    "#2f7151",
    "#64877a",
    "#8eaa9b",
    "#a5b8a9",
    "#c4d0c2",
    "#516d60",
    "#a3ae89",
    "#d5d8be",
    "#7c997f",
    "#bcc9ba",
    "#879f91",
    "#e0e7db",
  ],
};
const format = (v, s) =>
  v === null || v === undefined
    ? "—"
    : new Intl.NumberFormat("zh-CN", {
        maximumFractionDigits: /率|比|ROAS/.test(s.metric.key) ? 4 : 2,
      }).format(v);
export async function renderReportPdf(s, n) {
  const doc = new PDFDocument({
      size: "A4",
      margin: 48,
      bufferPages: true,
      info: {
        Title: s.title + " · 分析报告",
        Author: "见数 Seet",
        Subject: s.metric.key + "数据分析",
      },
    }),
    chunks = [];
  const completed = new Promise((resolve, reject) => {
    doc.on("data", (part) => chunks.push(part));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.registerFont("body", font).font("body");
  const W = 499;
  const text = (
    value,
    x,
    y,
    size = 10,
    width = W,
    color = c.ink,
    extra = {},
  ) => {
    doc
      .font("body")
      .fontSize(size)
      .fillColor(color)
      .text(String(value), x, y, { width, lineGap: 3, ...extra });
    return doc.y;
  };
  const line = (y) =>
    doc.moveTo(48, y).lineTo(547, y).lineWidth(0.6).stroke(c.line);
  function pageHeader(section) {
    text("见数  Seet", 48, 30, 12, 250, c.green);
    text(section, 330, 33, 9, 217, c.muted, { align: "right" });
    line(61);
  }
  function section(title, y) {
    text(title, 48, y, 13);
    return y + 28;
  }
  function room(y, need) {
    if (y + need <= 746) return y;
    doc.addPage();
    pageHeader("解读与依据（续）");
    return 87;
  }
  function facts(keys, scope = s) {
    return keys
      .map((key) => {
        const f = scope.facts[key];
        return `${f.label}：${format(f.value, scope)}${f.unit ? " " + f.unit : ["total", "average", "max", "min"].includes(key) ? " " + scope.metric.unit : ""}${f.names?.length ? "（" + f.names.join("、") + "）" : ""}`;
      })
      .join("；");
  }
  function chart(y, series = s) {
    const s = series;
    if (!s.chartAvailable) {
      text(s.chartNotice, 48, y + 50, 11, W, c.muted);
      return;
    }
    if (s.chart === "pie") {
      let rows = s.rows.filter((r) => r.value !== null);
      if (rows.length > 12) {
        const sorted = [...rows].sort((a, b) => b.value - a.value);
        rows = [
          ...sorted.slice(0, 11),
          {
            name: `其他（其余${rows.length - 11}组）`,
            value: sorted.slice(11).reduce((sum, r) => sum + r.value, 0),
          },
        ];
      }
      const total = rows.reduce((sum, r) => sum + r.value, 0),
        cx = 150,
        cy = y + 100,
        radius = 88;
      let angle = -Math.PI / 2;
      rows.forEach((row, i) => {
        const end = angle + (row.value / total) * Math.PI * 2;
        doc
          .moveTo(cx, cy)
          .lineTo(cx + radius * Math.cos(angle), cy + radius * Math.sin(angle));
        const steps = Math.max(2, Math.ceil((end - angle) * 40));
        for (let j = 1; j <= steps; j++) {
          const a = angle + ((end - angle) * j) / steps;
          doc.lineTo(cx + radius * Math.cos(a), cy + radius * Math.sin(a));
        }
        doc.closePath().fillAndStroke(c.chart[i % c.chart.length], c.white);
        angle = end;
        doc.rect(275, y + i * 17 + 4, 5, 5).fill(c.chart[i % c.chart.length]);
        text(row.name.slice(0, 19), 287, y + i * 17, 8, 150, c.ink);
        text((row.value / total * 100).toFixed(1) + "% · " + format(row.value, s), 435, y + i * 17, 8, 112, c.muted, {
          align: "right",
        });
      });
      doc.circle(cx, cy, radius * 0.58).fill(c.white);
      text("构成占比", cx - 43, cy - 8, 10, 86, c.muted, { align: "center" });
      return;
    }
    const rows = s.chart === "line" && s.rows.length > 24
        ? Array.from({ length: 24 }, (_, i) => s.rows[Math.round(i * (s.rows.length - 1) / 23)])
        : s.rows.slice(0, 24),
      valid = rows.filter((r) => r.value !== null);
    if (!valid.length) {
      text("没有有效数值，暂不绘图。", 48, y + 50, 11, W, c.muted);
      return;
    }
    const rawMin = Math.min(0, ...valid.map((r) => r.value)),
      rawMax = Math.max(0, ...valid.map((r) => r.value)),
      rawStep = (rawMax - rawMin || 1) / 4,
      power = 10 ** Math.floor(Math.log10(rawStep)),
      fraction = rawStep / power,
      tickStep = power * (fraction < 1.5 ? 1 : fraction < 3 ? 2 : fraction < 7 ? 5 : 10),
      min = Math.floor(rawMin / tickStep) * tickStep,
      max = rawMax > min ? Math.ceil(rawMax / tickStep) * tickStep : min + tickStep * 4,
      range = max - min,
      x0 = 94,
      top = y + 8,
      height = 156,
      width = 442,
      step = width / Math.max(rows.length, 1),
      py = (v) => top + height - ((v - min) / range) * height;
    for (let i = 0; i <= Math.round(range / tickStep); i++) {
      const v = min + tickStep * i,
        yy = py(v);
      doc
        .moveTo(x0, yy)
        .lineTo(x0 + width, yy)
        .lineWidth(0.5)
        .stroke(c.line);
      text(format(v, s), 48, yy - 5, 7, 40, c.muted, { align: "right" });
    }
    const stride = Math.max(1, Math.ceil(rows.length / 7));
    let connected = false;
    rows.forEach((row, i) => {
      const x = x0 + step * (i + 0.5);
      if (row.value !== null) {
        if (s.chart === "line") {
          if (!connected) doc.moveTo(x, py(row.value));
          else doc.lineTo(x, py(row.value));
          connected = true;
        } else {
          const a = py(0),
            b = py(row.value);
          doc
            .rect(
              x - Math.min(step * 0.3, 14),
              Math.min(a, b),
              Math.min(step * 0.6, 28),
              Math.max(0.8, Math.abs(a - b)),
            )
            .fill(c.green);
        }
      } else if (connected) {
        doc.lineWidth(1.8).stroke(c.green);
        connected = false;
      }
      if (s.chart !== "line" && (i % stride === 0 || i === rows.length - 1))
        text(
          row.name.length > 12 ? row.name.slice(0, 12) + "…" : row.name,
          x - Math.max(step * 1.4, width / 8) / 2,
          top + height + 12,
          7,
          Math.max(step * 1.4, width / 8),
          c.muted,
          { align: "center" },
        );
    });
    if (s.chart === "line") {
      if (connected) doc.lineWidth(1.8).stroke(c.green);
      rows.forEach((row, i) => {
        const x = x0 + step * (i + 0.5);
        if (row.value !== null) doc.circle(x, py(row.value), 2.5).fill(c.green);
        if (i % stride === 0 || i === rows.length - 1)
          text(
            row.name.length > 12 ? row.name.slice(0, 12) + "…" : row.name,
            x - Math.max(step * 1.4, width / 8) / 2,
            top + height + 12,
            7,
            Math.max(step * 1.4, width / 8),
            c.muted,
            { align: "center" },
          );
      });
    }
    if (s.rows.length > 24)
      text(
        `${s.chart === "line" ? "图表等距抽取24个时间点，包含首末期" : "图表展示前24组"}；统计覆盖全部${s.resultRows}组结果。`,
        48,
        y + 195,
        8,
        W,
        c.muted,
      );
  }
  pageHeader("分析概览");
  const titleEnd = text(s.title, 48, 86, 22, W);
  text(s.reportScope === "overall" ? "整份数据分析报告 · 全局分析与用户问题专题" : "数据分析报告", 48, titleEnd + 8, 10, W, c.muted);
  text(
    `${new Date(s.createdAt).toLocaleString("zh-CN")}  /  ${n.mode === "ai" ? "MiMo AI 解读" : "程序统计解读"}`,
    48,
    titleEnd + 30,
    8,
    W,
    c.muted,
  );
  const summaryY = Math.max(170, titleEnd + 60);
  section("分析摘要", summaryY);
  const summaryEnd = text(n.summary, 48, summaryY + 26, 10, W);
  const metricsY = Math.max(summaryY + 102, summaryEnd + 24),
    items = s.additive
      ? [
          ["合计", s.statistics.total],
          ["结果平均值", s.statistics.average],
          ["最高值", s.statistics.max],
        ]
      : [
          ["结果平均值", s.statistics.average],
          ["最高值", s.statistics.max],
          ["最低值", s.statistics.min],
        ];
  items.forEach(([label, value], i) => {
    const x = 48 + i * 171;
    text(label, x, metricsY, 9, 155, c.muted);
    const v = format(value, s);
    text(v, x, metricsY + 22, v.length > 13 ? 15 : 21, 155, c.green);
    text(s.metric.unit || "原始数值单位", x, metricsY + 53, 8, 155, c.muted);
  });
  let contentsY = section("本次报告的分析路径", metricsY + 103);
  for (const [index, chapter] of n.chapters.entries()) {
    contentsY = room(contentsY, 65);
    contentsY = text(`${String(index + 1).padStart(2, "0")}   ${chapter.title}`, 48, contentsY, 11, W) + 14;
  }
  if (n.questionSection) contentsY = text("附加专题   用户问题分析（一至两页）", 48, contentsY, 11, W) + 14;
  contentsY = room(contentsY + 20, 30);
  text(`${s.rawRows} 行原始数据 → ${s.resultRows} 组当前结果；${s.statistics.count} 个有效值。`, 48, contentsY, 9, W, c.muted);
  doc.addPage();
  pageHeader(s.reportScope === "overall" ? "全局结论与核心发现" : "问题与核心发现");
  let y = section(s.reportScope === "overall" ? "整份数据的分析结论" : "回应你的分析问题", 87);
  const height = (value, size = 10, width = W) => doc.font("body").fontSize(size).heightOfString(String(value), { width, lineGap: 3 });
  function paragraph(value, currentY, size = 10, color = c.ink) {
    currentY = room(currentY, height(value, size) + 8);
    return text(value, 48, currentY, size, W, color) + 14;
  }
  if (s.questions.length) y = paragraph(s.questions.slice(-3).map(q => "“" + q.slice(0, 260) + "”").join("\n"), y, 9, c.muted);
  else y = paragraph(s.reportScope === "overall" ? "本部分覆盖全部原始数据，不受工作台当前筛选影响。用户提出的问题另设专题分析。" : "本次尚未提出具体问题，AI 根据数据结构、当前指标和筛选结果进行探索分析。", y, 9, c.muted);
  y = paragraph(n.answer, y);
  y = room(y, 70);
  y = section("关键发现与统计依据", y + 8);
  for (const finding of n.findings) {
    y = room(y, height(finding.explanation) + height(facts(finding.evidence), 8) + 66);
    text(finding.headline, 48, y, 12);
    y = text(finding.explanation, 48, y + 23, 10, W) + 8;
    const evidenceText = facts(finding.evidence);
    y = evidenceText ? text(evidenceText, 48, y, 8, W, c.green) + 22 : y + 14;
  }
  for (const chapter of n.chapters) {
    const candidate = s.charts.find(c => c.id === chapter.chartId);
    if (!candidate) continue;
    doc.addPage();
    pageHeader("专题图表与解读");
    const end = text(chapter.title, 48, 87, 18, W);
    let chartY = text(candidate.title + " / " + candidate.metric.unit, 48, end + 10, 9, W, c.muted) + 24;
    chart(chartY, { ...candidate, chart: candidate.type, chartAvailable: true, resultRows: candidate.rows.length });
    y = chartY + 234;
    y = paragraph(candidate.scope, y, 8, c.muted);
    y = room(y + 6, 80);
    y = section("这张图说明了什么", y);
    y = paragraph(chapter.analysis, y, 10);
    y = paragraph(facts(chapter.evidence), y, 8, c.green);
  }
  if (s.questionSection && n.questionSection) {
    const focus = s.questionSection, response = n.questionSection;
    const chapters = response.chapters.slice(0, 2);
    for (const [index, chapter] of chapters.entries()) {
      const candidate = focus.charts.find(item => item.id === chapter.chartId);
      if (!candidate) continue;
      doc.addPage();
      pageHeader(`用户问题专题 · ${index + 1} / ${chapters.length}`);
      y = text(chapter.title, 48, 87, 17, W) + 12;
      const filters = focus.view.filters.map(f => `${f.field} ${f.op === "eq" ? "=" : f.op === "in" ? "属于" : f.op} ${Array.isArray(f.value) ? f.value.join("、") : f.value}`).join("；") || "全部记录";
      y = text(`专题范围：${filters}；指标：${focus.metric.key}。本页数值仅代表该专题范围。`, 48, y, 8, W, c.muted) + 10;
      if (index === 0) {
        y = text("你的问题：“" + (focus.questions.at(-1) || "当前分析").slice(0, 100) + "”", 48, y, 9, W) + 8;
        y = text(response.answer, 48, y, 9, W) + 12;
      }
      y = text(candidate.title + " / " + candidate.metric.unit, 48, y, 9, W, c.muted) + 15;
      chart(y, { ...candidate, chart: candidate.type, chartAvailable: true, resultRows: candidate.rows.length });
      y += 216;
      y = text(chapter.analysis, 48, y, 9, W) + 12;
      text(facts(chapter.evidence.slice(0, 4), focus), 48, y, 8, W, c.green);
    }
  }
  doc.addPage();
  pageHeader("质量、方法与行动建议");
  y = 87;
  y = section("数据质量", y + 2);
  const q = s.quality.metrics.find((m) => m.key === s.metric.key);
  y =
    text(
      `质量检查覆盖全部 ${s.rawRows} 行原始数据。完全重复记录 ${s.quality.duplicateRows} 条；“${s.metric.key}”缺失 ${q?.missing || 0} 个、负值 ${q?.negative || 0} 个。`,
      48,
      y,
      10,
      W,
    ) + 10;
  y =
    text(
      "重复与负值仅提示，不自动删除；缺失值不参与数值计算，零值参与。负数是否异常需要结合指标含义判断。",
      48,
      y,
      9,
      W,
      c.muted,
    ) + 24;
  y = room(y, 200);
  y = section("计算口径与分析范围", y);
  const grouping = s.view.groupBy
    ? `按“${s.view.groupBy === "name" ? "分类" : s.view.groupBy}”分组${s.view.granularity !== "none" ? "，日期粒度为" + ({ day: "日", month: "月", year: "年" }[s.view.granularity]) : ""}，当前指标采用${{ sum: "求和", average: "简单平均", count: "有效值计数", min: "最小值", max: "最大值" }[s.aggregation]}。`
    : "按原始记录分析。";
  const filtering = s.view.filters.length
    ? s.view.filters
        .map(
          (f) =>
            `${f.field} ${{ eq: "=", in: "属于", contains: "包含", gte: "≥", lte: "≤" }[f.op]} ${Array.isArray(f.value) ? f.value.join("、") : f.value}`,
        )
        .join("；")
    : "无额外筛选";
  y = text(grouping + " 筛选：" + filtering + "。", 48, y, 9, W) + 9;
  y = text("来源：" + s.source, 48, y, 9, W, c.muted) + 9;
  y =
    text(
      "均值为当前结果有效值的简单平均，不自动计算加权比例。当前报告仅提供描述性统计，不证明因果关系，也不构成预测。",
      48,
      y,
      9,
      W,
      c.muted,
    ) + 22;
  const nextStepsHeight =
    28 +
    n.nextSteps.reduce(
      (height, step) =>
        height +
        doc.fontSize(9).heightOfString("• " + step, { width: W, lineGap: 3 }) +
        8,
      0,
    ) +
    12 +
    doc.fontSize(8).heightOfString(n.notice, { width: W, lineGap: 3 });
  y = room(y, nextStepsHeight);
  y = section("建议继续核查", y);
  for (const step of n.nextSteps) y = paragraph("• " + step, y, 9);
  y = room(y, 70);
  y = section("分析边界", y + 8);
  for (const limitation of n.limitations) y = paragraph("• " + limitation, y, 9, c.muted);
  paragraph(n.notice, y + 12, 8, c.muted);
  let appendixY = 0;
  const appendix = s.rows.slice(0, 40);
  function appendixHeader() {
    doc.addPage();
    pageHeader("结果附录");
    section("当前视图数据", 87);
    text(
      `共 ${s.resultRows} 组；${s.resultRows > 40 ? "附录仅列前40组，完整数据请另行导出CSV。" : "以下为当前筛选与分组后的结果。"}`,
      48,
      115,
      9,
      W,
      c.muted,
    );
    text("分类", 48, 150, 9, 330, c.muted);
    text(
      s.metric.key + (s.metric.unit ? "（" + s.metric.unit + "）" : ""),
      385,
      150,
      9,
      162,
      c.muted,
      { align: "right" },
    );
    line(172);
    appendixY = 184;
  }
  appendixHeader();
  for (const row of appendix) {
    const h = Math.max(
      27,
      doc.fontSize(9).heightOfString(row.name, { width: 320 }) + 12,
    );
    if (appendixY + h > 750) appendixHeader();
    text(row.name, 48, appendixY, 9, 320);
    text(format(row.value, s), 385, appendixY, 9, 162, c.ink, {
      align: "right",
    });
    line(appendixY + h - 6);
    appendixY += h;
  }
  if (!appendix.length)
    text("筛选后没有可展示的结果。", 48, 190, 10, W, c.muted);
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(i);
    doc.page.margins.bottom = 0;
    line(783);
    text("见数，让分析有据可循。", 48, 797, 8, 350, c.muted);
    text(`${i + 1} / ${range.count}`, 470, 797, 8, 77, c.muted, {
      align: "right",
    });
  }
  doc.end();
  return { bytes: await completed, pages: range.count };
}
