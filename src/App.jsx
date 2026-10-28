import { useEffect, useMemo, useRef, useState, lazy, Suspense } from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Upload,
  Plus,
  ChartNoAxesColumnIncreasing,
  ChartLine,
  ChartPie,
  Table2,
  FileText,
  Download,
  Check,
  ChevronDown,
  ChevronsUpDown,
  X,
  Info,
  Sparkles,
  Database,
  PanelLeftClose,
  PanelLeftOpen,
  RotateCcw,
  CheckCheck,
  SlidersHorizontal,
  LoaderCircle,
  FileSpreadsheet,
  MessageSquare,
  ArrowRight,
  BookOpen,
  Link2,
  AudioLines,
  Square,
} from "lucide-react";
import Papa from "papaparse";
import Markdown from "react-markdown";
import {
  fromMatrix,
  validateDataset,
  summarize,
  csvExport,
  samples,
} from "./data.mjs";
import { apiRequest, agentRequest } from "./api.mjs";
import {
  buildView,
  filterSource,
  defaultView,
  dimensionsFor,
  aggregationFor,
} from "./analysis.mjs";
import { HelpPage, LoginPage } from "./pages.jsx";
import { useRecords, emptyWorkspace } from "./useRecords.jsx";
import { useVoiceInput } from "./useVoiceInput.jsx";
import AnalysisHistory from "./components/AnalysisHistory.jsx";
import ReportStudio from "./components/ReportStudio.jsx";
import { format } from "./format.mjs";
import { reportKeyFor, serializeReport, restoreReport } from "./reportState.mjs";
const ChartView = lazy(() => import("./components/ChartView.jsx"));
import DataTable from "./components/DataTable.jsx";
import ChartBoundary from "./components/ChartBoundary.jsx";

const clubText =
  "摄影社报名80人、到场62人；篮球社报名120人、到场108人；读书会报名50人、到场45人。";
function download(filename, text, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Logo() {
  return (
    <span className="brand">
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <strong>见数</strong>
      <span className="brand-en">Seet</span>
    </span>
  );
}
export default function App() {
  const [dataset, setDataset] = useState(null);
  const [reportInput, setReportInput] = useState(null);
  const [storedReport, setStoredReport] = useState(null);
  const reportCache = useMemo(() => restoreReport(storedReport), [storedReport]);
  const [view, setView] = useState(null),
    [agentSteps, setAgentSteps] = useState([]),
    [agentStatus, setAgentStatus] = useState("");
  const agentAbort = useRef(null);
  const [draft, setDraft] = useState(null),
    [text, setText] = useState(""),
    [metricKey, setMetricKey] = useState("销量");
  const [tab, setTab] = useState(
    () => new URLSearchParams(location.search).get("tab") || "chart",
  );
  const [chart, setChart] = useState("bar"),
    [sort, setSort] = useState(false),
    [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [examples, setExamples] = useState(false),
    [sidebar, setSidebar] = useState(true);
  const [page, setPage] = useState(location.pathname),
    [user, setUser] = useState(null);
  const [authPending, setAuthPending] = useState(true);
  const [previous, setPrevious] = useState(null);
  const [aiState, setAIState] = useState("checking"),
    [model, setModel] = useState("mimo-v2.6-flash"),
    [lastRequest, setLastRequest] = useState("");
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      text: "你好，我是见数。给我一段带数字的话，或一份数据文件，我们一起看看其中的规律。",
    },
  ]);
  const inputRef = useRef(null),
    fileRef = useRef(null),
    chatEnd = useRef(null),
    version = useRef(0);
  async function checkAI() {
    setAIState("checking");
    try {
      const r = await apiRequest("/api/status");
      setModel(r.model || "mimo-v2.6-flash");
      setAIState(r.configured ? "ready" : "unconfigured");
    } catch {
      setAIState("offline");
    }
  }
  useEffect(() => {
    checkAI();
    apiRequest("/api/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => {})
      .finally(() => setAuthPending(false));
    const pop = () => setPage(location.pathname);
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    if (!authPending && !user && page !== "/login") {
      history.replaceState(null, "", "/login");
      setPage("/login");
    }
  }, [authPending, user, page]);
  useEffect(() => {
    const expired = () => {
      version.current++;
      setUser(null);
      setBusy(false);
      history.replaceState(null, "", "/login");
      setPage("/login");
    };
    window.addEventListener("seet:auth-expired", expired);
    return () => window.removeEventListener("seet:auth-expired", expired);
  }, []);
  useEffect(() => {
    document.title =
      page === "/history"
        ? "分析记录 · 见数"
        : page === "/help"
          ? "使用说明 · 见数"
          : page === "/login"
            ? "账号登录 · 见数"
            : "见数 — AI 数据分析工作台";
  }, [page]);
  useEffect(() => {
    if (page !== "/") return;
    const u = new URL(location.href);
    u.searchParams.set("tab", tab);
    history.replaceState(null, "", u);
  }, [tab, page]);
  useEffect(() => {
    const box = chatEnd.current?.parentElement;
    if (box) box.scrollTop = box.scrollHeight;
  }, [messages, busy, page]);
  function navigate(target) {
    if (location.pathname !== target) history.pushState(null, "", target);
    setPage(target);
    window.scrollTo(0, 0);
  }
  function focusAI() {
    navigate("/");
    setSidebar(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({
        block: "nearest",
        behavior: "smooth",
      });
    });
  }
  useEffect(() => {
    if (notice) {
      const timer = setTimeout(() => setNotice(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [notice]);
  const analyzed = useMemo(
    () => (dataset ? buildView(dataset, view || defaultView(dataset)) : null),
    [dataset, view],
  );
  const filteredSource = useMemo(
    () => dataset ? filterSource(dataset, view || defaultView(dataset)) : null,
    [dataset, view],
  );
  const metric =
    analyzed?.metrics.find((m) => m.key === metricKey) || analyzed?.metrics[0];
  const stats = useMemo(
    () => (analyzed && metric ? summarize(analyzed, metric.key) : null),
    [analyzed, metric],
  );
  const displayed = useMemo(
    () =>
      analyzed
        ? {
            ...analyzed,
            rows: sort
              ? [...analyzed.rows].sort(
                  (a, b) =>
                    (b[metric.key] ?? -Infinity) - (a[metric.key] ?? -Infinity),
                )
              : analyzed.rows,
          }
        : null,
    [analyzed, metric, sort],
  );
  const say = (value) =>
    setMessages((m) => [...m, { role: "assistant", text: value }].slice(-100));
  function restoreWorkspace(state) {
    agentAbort.current?.abort();
    setAgentSteps([]);
    setAgentStatus("");
    version.current++;
    setBusy(false);
    setDataset(state.dataset);
    setView(state.view || null);
    setDraft(state.draft);
    setMessages(state.messages);
    setChart(state.chart);
    setSort(state.sort);
    setMetricKey(state.metricKey);
    setTab(state.tab);
    setEditing(false);
    setText("");
    setError("");
    setLastRequest("");
    setPrevious(null);
    setStoredReport(state.report || null);
  }
  const snapshot = useMemo(
    () => ({ dataset, draft, messages, chart, sort, metricKey, tab, view, report: storedReport }),
    [dataset, draft, messages, chart, sort, metricKey, tab, view, storedReport],
  );
  const records = useRecords(user, snapshot, restoreWorkspace);
  useEffect(() => { setReportInput(null); }, [user?.username, records.activeId]);
  const reportKey = useMemo(() => reportKeyFor({ dataset, view, metricKey, chart, sort, messages }), [dataset, view, metricKey, chart, sort, messages]);
  const currentReport = reportCache?.key === reportKey ? reportCache.result : null;
  const savedReport = reportCache?.result;
  function openReport(force = false, previewSaved = false) {
    if (!dataset || draft || editing || busy) return;
    setReportInput({
      dataset: structuredClone(dataset),
      view: structuredClone(view),
      metricKey: metric.key,
      chart,
      sort,
      owner: user.username,
      history: messages.slice(-12).map(m => ({ role: m.role, text: m.text })),
      key: reportKey,
      recordId: records.activeId,
      cachedResult: force ? null : previewSaved ? savedReport : currentReport,
      previousVersion: previewSaved && !currentReport,
    });
  }
  function generateReport() { openReport(); }
  const voice = useVoiceInput({
    owner: user?.username,
    scope: `${user?.username || ""}:${records.activeId}`,
    disabled: busy || editing || records.loading || !user,
    onText: (recognized) => {
      setText((current) => (current ? current + " " + recognized : recognized));
      requestAnimationFrame(() => inputRef.current?.focus());
    },
  });
  function loadSample(s) {
    if (records.loading || busy) return;
    version.current++;
    setDataset(structuredClone(s));
    setView(defaultView(s));
    setMetricKey(s.metrics[0].key);
    setDraft(null);
    setError("");
    setEditing(false);
    setSort(false);
    setChart(s.id === "budget" ? "pie" : "bar");
    setExamples(false);
    setTab("chart");
    setNotice(`已载入“${s.title}”演示数据`);
  }
  async function clear() {
    await records.newRecord();
    setSidebar(true);
    inputRef.current?.focus();
  }
  async function importFile(file) {
    if (!file || busy || records.loading) return;
    setError("");
    setLastRequest("");
    if (file.size > 20 * 1024 * 1024) {
      setError("请上传 20 MB 以内的文件。");
      return;
    }
    const token = ++version.current;
    setBusy(true);
    try {
      const ext = file.name.split(".").pop().toLowerCase();
      let d;
      if (ext === "xlsx") {
        const { readSheet } = await import("read-excel-file/browser");
        d = fromMatrix(
          await readSheet(file),
          file.name.replace(/\.[^.]+$/, ""),
        );
      } else {
        const raw = await file.text();
        if (ext === "json") {
          const parsed = JSON.parse(raw);
          d = Array.isArray(parsed)
            ? fromMatrix(
                [
                  Object.keys(parsed[0] || {}),
                  ...parsed.map((r) => Object.keys(parsed[0]).map((k) => r[k])),
                ],
                file.name,
              )
            : validateDataset(parsed);
        } else if (["csv", "tsv"].includes(ext)) {
          const p = Papa.parse(raw, { skipEmptyLines: "greedy" });
          if (p.errors.some((e) => e.code !== "UndetectableDelimiter"))
            throw new Error("表格分隔格式有误，请检查引号和分隔符。");
          d = fromMatrix(p.data, file.name.replace(/\.[^.]+$/, ""));
        } else if (ext === "txt") {
          setAIState("requesting");
          d = validateDataset(
            (await apiRequest("/api/extract", { text: raw })).dataset,
          );
          setAIState("success");
        } else throw new Error("支持 CSV、TSV、XLSX、JSON 和 TXT 文件。");
      }
      if (token !== version.current) return;
      setDataset({
        ...d,
        source:
          ext === "txt"
            ? `MiMo AI 提取，待人工确认 / ${file.name}`
            : `本地文件：${file.name}`,
      });
      setDraft(null);
      setView(defaultView(d));
      setChart("bar");
      setSort(false);
      setMetricKey(d.metrics[0].key);
      setTab("data");
      say(
        `已读取“${file.name}”，保留 ${d.rows.length} 行原始数据、${d.dimensions?.length || 1} 个分类字段和 ${d.metrics.length} 个指标。可以直接告诉我按什么分组、计算或绘图，也可在右侧查看原始数据。`,
      );
    } catch (e) {
      if (token === version.current) {
        setError(e.message);
        if (/\.txt$/i.test(file.name)) setAIState("failed");
      }
    } finally {
      if (token === version.current) setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function submit(e, value = text) {
    e?.preventDefault();
    if (!value.trim() || busy || editing || records.loading) return;
    const prompt = value.trim();
    setLastRequest(prompt);
    setError("");
    setMessages((m) => [...m, { role: "user", text: prompt }].slice(-100));
    setText("");
    const token = ++version.current;
    setBusy(true);
    setAgentSteps([]);
    setAgentStatus("正在理解需求");
    const controller = new AbortController();
    agentAbort.current = controller;
    try {
      setAIState("requesting");
      const result = await agentRequest(
        {
          text: prompt,
          dataset,
          draft,
          history: messages.slice(-12),
          metricKey,
          view,
          chart,
          sort,
          owner: user.username,
        },
        (event) => {
          if (token !== version.current) return;
          if (event.type === "status") setAgentStatus(event.text);
          if (event.entry)
            setAgentSteps((steps) => [
              ...steps.filter((s) => s.id !== event.entry.id),
              event.entry,
            ]);
        },
        controller.signal,
      );
      if (token !== version.current) return;
      setAIState("success");
      if (result.kind === "agent") {
        if (result.dataset) {
          setDataset({
            ...validateDataset(result.dataset),
            source: "MiMo Agent 录入",
          });
          setDraft(null);
        } else if (result.commitDraft && draft) {
          setDataset({
            ...draft,
            source:
              draft.source?.replace("，待人工确认", "，已确认") || "AI 数据",
          });
          setDraft(null);
        }
        if (result.changed) {
          setView(result.view);
          setChart(result.chart);
          setMetricKey(result.metricKey);
          setSort(result.sort);
          setTab("chart");
        }
        setMessages((m) =>
          [
            ...m,
            { role: "assistant", text: result.answer, trace: result.trace },
          ].slice(-100),
        );
        setAgentSteps([]);
        return;
      }
      if (result.kind === "answer") {
        say(result.answer);
        return;
      }
      if (result.kind === "actions") {
        for (const action of result.actions) {
          if (action.tool === "set_chart") {
            setChart(action.value);
            setTab("chart");
          } else if (action.tool === "select_metric")
            setMetricKey(action.value);
          else if (action.tool === "sort") setSort(action.value === "desc");
        }
        say(result.answer);
        return;
      }
      if (result.kind === "action") {
        if (["bar", "line", "pie"].includes(result.action)) {
          setChart(result.action);
          setTab("chart");
        } else setSort(result.action === "sort");
        say(result.answer);
        return;
      }
      const d = validateDataset(result.dataset);
      setDraft({ ...d, source: "MiMo AI 提取，待人工确认" });
      setView(defaultView(d));
      setChart("bar");
      setSort(false);
      setMetricKey(d.metrics[0].key);
      setTab("data");
      say(
        `MiMo 已整理出 ${d.rows.length} 行数据和 ${d.metrics.length} 个指标。请核对名称、数字和单位，确认后再绘图。`,
      );
    } catch (e) {
      if (token === version.current) {
        setAIState("failed");
        setError(e.message);
        say(
          e.name === "AbortError"
            ? "已停止当前任务，未应用未完成的操作。"
            : `AI 请求未完成：${e.message}`,
        );
      }
    } finally {
      if (token === version.current) setBusy(false);
      if (agentAbort.current === controller) agentAbort.current = null;
    }
  }
  function confirmDraft() {
    try {
      const valid = validateDataset(draft);
      if (!view) setView(defaultView(valid));
      setDataset({
        ...valid,
        source: draft.source.replace("，待人工确认", "，已确认"),
      });
      if (!valid.metrics.some((m) => m.key === metricKey))
        setMetricKey(valid.metrics[0].key);
      setDraft(null);
      setEditing(false);
      setTab("chart");
      say(
        "数据已确认，图表与计算结果已更新。你可以继续调整图表，或在数据表里修正数值。",
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function updateDataset(d) {
    setDataset({
      ...d,
      source: dataset.source.includes("已编辑")
        ? dataset.source
        : `${dataset.source}（已编辑）`,
    });
  }
  const header = (
    <header className="topbar">
      <button
        className="brand-home"
        aria-label="见数首页"
        onClick={() => navigate("/")}
      >
        <Logo />
      </button>
      <span className="top-divider" />
      <span className="workspace-name">个人工作台</span>
      {user && (
        <nav className="topnav" aria-label="主要导航">
          <button
            className={page === "/" && !examples ? "nav-active" : ""}
            onClick={() => {
              navigate("/");
              setExamples(false);
            }}
          >
            分析空间
          </button>
          <button
            className={page === "/" && examples ? "nav-active" : ""}
            onClick={() => {
              navigate("/");
              setExamples(!examples);
            }}
          >
            示例数据
          </button>
          <button
            className={page === "/history" ? "nav-active" : ""}
            onClick={() => navigate("/history")}
            disabled={busy || records.loading}
          >
            分析记录
          </button>
        </nav>
      )}
      <div className="top-right">
        <button
          className={`help-link ${page === "/help" ? "current" : ""}`}
          onClick={() => navigate("/help")}
        >
          <BookOpen size={16} />
          使用说明
        </button>
        {user ? (
          <div className="account-area">
            <button
              className="account-button"
              title={user.username}
              onClick={() => navigate("/login")}
            >
              <span className="avatar">{user.username.slice(0, 1)}</span>
              <span className="account-name">{user.username}</span>
            </button>
            <button
              className="logout-button"
              onClick={async () => {
                try {
                  await records.saveNow();
                  await apiRequest("/api/auth/logout", {});
                  restoreWorkspace(emptyWorkspace());
                  setUser(null);
                  navigate("/login");
                  setNotice("已退出登录");
                } catch (e) {
                  setNotice(e.message);
                }
              }}
            >
              退出
            </button>
          </div>
        ) : (
          <button className="login-link" onClick={() => navigate("/login")}>
            登录
          </button>
        )}
      </div>
    </header>
  );
  if (authPending)
    return (
      <div className="auth-loading">
        <LoaderCircle className="spin" size={24} />
        <p>正在验证登录状态…</p>
      </div>
    );
  if (!user)
    return (
      <div className="app-frame">
        {header}
        <LoginPage navigate={navigate} user={null} onLogin={setUser} />
      </div>
    );
  if (!records.ready)
    return (
      <div className="app-frame">
        {header}
        <div className="auth-loading">
          <LoaderCircle className={records.error ? "" : "spin"} size={24} />
          <p>{records.error || "正在恢复你的分析记录…"}</p>
          {records.error && (
            <button
              className="primary-button"
              onClick={() => location.reload()}
            >
              重新加载
            </button>
          )}
        </div>
      </div>
    );
  if (page === "/history")
    return (
      <div className="app-frame records-app">
        {header}
        <AnalysisHistory
          records={records}
          busy={busy}
          onOpen={async (id) => {
            await records.openRecord(id);
            navigate("/");
          }}
        />
      </div>
    );
  if (page === "/help")
    return (
      <div className="app-frame">
        {header}
        <HelpPage navigate={navigate} />
      </div>
    );
  if (page === "/login")
    return (
      <div className="app-frame">
        {header}
        <LoginPage navigate={navigate} user={user} onLogin={setUser} />
      </div>
    );
  return (
    <div className="app-frame agent-app">
      {header}
      <fieldset
        className={`workspace ${sidebar ? "" : "sidebar-closed"}`}
        disabled={records.loading}
      >
        <aside className="sidebar" aria-label="数据输入与分析对话">
          <div className="side-title">
            <h2>
              <MessageSquare size={18} />
              AI 分析工作台
            </h2>
            <button
              className="icon-button"
              aria-label="收起输入面板"
              onClick={() => setSidebar(false)}
            >
              <PanelLeftClose size={17} />
            </button>
          </div>
          <button
            className="new-analysis"
            onClick={clear}
            disabled={busy || records.loading}
          >
            <Plus size={16} />
            新建分析
          </button>
          <section className="agent-thread" aria-label="AI 分析助手">
            <header className="composer-agent-heading">
              <span>
                <Sparkles size={19} />
                <strong>AI 分析助手</strong>
              </span>
              <small className="assistant-model-name">{model}</small>
            </header>
            <div className="conversation" aria-live="polite">
              {messages.map((m, i) => (
                <div className={`message ${m.role}`} key={i}>
                  {m.role === "assistant" && (
                    <span className="assistant-label">
                      <span className="mini-mark" />
                      见数
                    </span>
                  )}
                  {m.role === "assistant" ? (
                    <div className="message-markdown">
                      <Markdown skipHtml>{m.text}</Markdown>
                    </div>
                  ) : (
                    <p>{m.text}</p>
                  )}
                  {m.trace?.length > 0 && (
                    <details className="tool-trace">
                      <summary>查看执行过程（{m.trace.length} 步）</summary>
                      <ol>
                        {m.trace.map((step, j) => (
                          <li key={j} className={step.status}>
                            <span>
                              {step.status === "success" ? (
                                <Check size={13} />
                              ) : (
                                <Info size={13} />
                              )}{" "}
                              {step.label}
                            </span>
                            <small>{step.summary}</small>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                </div>
              ))}
              {busy && (
                <div className="processing">
                  <LoaderCircle size={15} className="spin" />
                  {agentStatus || "正在处理需求…"}
                </div>
              )}
              {busy && agentSteps.length > 0 && (
                <ol className="live-tool-steps">
                  {agentSteps.map((step) => (
                    <li key={step.id}>
                      <span>
                        {step.status === "running" ? (
                          <LoaderCircle size={13} className="spin" />
                        ) : step.status === "success" ? (
                          <Check size={13} />
                        ) : (
                          <Info size={13} />
                        )}{" "}
                        {step.label}
                      </span>
                      {step.summary && <small>{step.summary}</small>}
                    </li>
                  ))}
                </ol>
              )}
              <div ref={chatEnd} />
            </div>
            {dataset && (
              <div className="suggestions">
                <button
                  onClick={() => submit(null, "帮我总结这组数据")}
                  disabled={busy || editing}
                >
                  总结当前数据
                </button>
                <button
                  onClick={() => submit(null, "换成折线图")}
                  disabled={busy || editing}
                >
                  换成折线图
                </button>
              </div>
            )}
            <form className="composer" onSubmit={submit}>
              <label htmlFor="prompt" className="sr-only">
                数据或分析需求
              </label>
              <textarea
                id="prompt"
                ref={inputRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={12000}
                disabled={editing || voice.active}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit(e);
                }}
              />
              <div className="compose-tools">
                <button
                  type="button"
                  className="icon-button"
                  aria-label="上传数据文件"
                  onClick={() => fileRef.current.click()}
                  disabled={busy || voice.active}
                >
                  <Plus size={19} />
                </button>
                <span className="composer-shortcut">Ctrl + Enter</span>
                <div
                  className={`ai-status composer-model-status ${aiState}`}
                  role="status"
                  title={`分析模型：${model}`}
                >
                  {(aiState === "requesting" ||
                    voice.phase === "transcribing") && (
                    <LoaderCircle size={13} className="spin" />
                  )}
                  <span>
                    {voice.phase === "requesting"
                      ? "等待麦克风"
                      : voice.phase === "recording"
                        ? `录音中 ${voice.seconds}s`
                        : voice.phase === "transcribing"
                          ? "MiMo 识别中"
                          : voice.phase === "success"
                            ? "MiMo 识别成功"
                            : {
                                checking: "MiMo 检查中",
                                ready: "MiMo 已就绪",
                                success: "MiMo 调用成功",
                                requesting: "MiMo 调用中",
                                failed: "MiMo 调用失败",
                                unconfigured: "MiMo 未配置",
                                offline: "MiMo 未连接",
                              }[aiState]}
                  </span>
                  {["offline", "failed", "unconfigured"].includes(aiState) &&
                    !voice.active && (
                      <button type="button" onClick={checkAI} disabled={busy}>
                        重试
                      </button>
                    )}
                </div>
                {busy ? (
                  <button
                    type="button"
                    className="stop-agent"
                    onClick={() => agentAbort.current?.abort()}
                  >
                    停止
                  </button>
                ) : voice.active ? (
                  <button
                    type="button"
                    className="voice-button recording"
                    aria-label={
                      voice.phase === "recording"
                        ? "结束录音并识别"
                        : "正在识别语音"
                    }
                    onClick={voice.finish}
                    disabled={voice.phase !== "recording"}
                  >
                    {voice.phase === "recording" ? (
                      <Square size={16} fill="currentColor" />
                    ) : (
                      <LoaderCircle size={19} className="spin" />
                    )}
                  </button>
                ) : text.trim() ? (
                  <button
                    className="send-button"
                    aria-label="发送数据或问题"
                    disabled={!text.trim() || busy || editing}
                  >
                    <ArrowUp size={19} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="voice-button"
                    aria-label="开始语音输入"
                    title="语音输入"
                    onClick={voice.start}
                    disabled={editing || records.loading}
                  >
                    <AudioLines size={20} />
                  </button>
                )}
              </div>
              {voice.active && (
                <div className="voice-feedback" role="status">
                  <span>
                    {voice.phase === "recording"
                      ? "正在录音，再次点击右侧按钮结束（最长60秒）"
                      : voice.phase === "transcribing"
                        ? "正在识别，文字会填入输入框"
                        : "请允许本站使用麦克风"}
                  </span>
                  <button type="button" onClick={voice.cancel}>
                    取消
                  </button>
                </div>
              )}
              {voice.error && (
                <p className="voice-error" role="alert">
                  {voice.error}
                </p>
              )}
              <div className="record-save-status" role="status">
                <span>
                  {
                    {
                      idle: "新分析，发送后自动保存",
                      pending: "等待自动保存…",
                      saving: "正在保存…",
                      saved: "已保存到当前账号",
                      error: "保存失败",
                      "load-error": "记录加载失败",
                    }[records.status]
                  }
                </span>
                <button
                  type="button"
                  onClick={() => records.saveNow().catch(() => {})}
                  disabled={
                    busy ||
                    records.status === "saving" ||
                    (!dataset &&
                      !draft &&
                      !messages.some((m) => m.role === "user") &&
                      !records.records.some((r) => r.id === records.activeId))
                  }
                >
                  {records.status === "error" ? "重试保存" : "保存记录"}
                </button>
              </div>
              {records.error && (
                <p className="save-error" role="alert">
                  {records.error}
                </p>
              )}
            </form>
          </section>
          <p className="privacy-note">
            思考由小米 MiMo 提供支持
          </p>
        </aside>
        <main className="main-sheet">
          {examples && (
            <section className="examples-tray">
              <div className="section-heading">
                <h2>从一个小问题开始</h2>
                <button
                  className="icon-button"
                  aria-label="关闭示例"
                  onClick={() => setExamples(false)}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="example-options">
                {samples.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => loadSample(s)}
                    disabled={busy}
                  >
                    <strong>
                      {s.title}
                      <ArrowUpRight size={16} />
                    </strong>
                    <span>{s.description}</span>
                    <small>演示数据</small>
                  </button>
                ))}
              </div>
            </section>
          )}
          <div className="page-heading">
            <div>
              <div className="title-row">
                {!sidebar && (
                  <button
                    className="icon-button"
                    aria-label="展开输入面板"
                    onClick={() => setSidebar(true)}
                  >
                    <PanelLeftOpen size={19} />
                  </button>
                )}
                <h1>
                  {draft
                    ? "核对你的数据"
                    : dataset?.title || "开始一次新的发现"}
                </h1>
                {dataset?.source.startsWith("演示") && !draft && (
                  <span className="sample-tag">演示数据</span>
                )}
              </div>
              <p>
                {draft
                  ? "确认名称、数值和单位，结果将从这里生成。"
                  : "从零散数字，到看得见的答案。"}
              </p>
            </div>
            <button
              className="secondary-button export-top"
              disabled={!dataset || Boolean(draft) || editing || busy}
              onClick={generateReport}
            >
              <Download size={16} />
              生成报告
            </button>
          </div>
          {error && (
            <div className="error-banner" role="alert">
              <Info size={17} />
              <span>{error}</span>
              {lastRequest && aiState === "failed" && (
                <button
                  className="retry-button"
                  onClick={() => submit(null, lastRequest)}
                  disabled={busy}
                >
                  重试
                </button>
              )}
              <button
                className="icon-button"
                aria-label="关闭错误提示"
                onClick={() => setError("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {draft ? (
            <section className="draft-panel">
              <div className="section-heading">
                <h2>
                  待确认数据{" "}
                  <span className="count-label">{draft.rows.length} 行</span>
                </h2>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setDraft(null);
                    say("已取消这次导入，当前数据保持不变。");
                    setError("");
                    setTab("chart");
                  }}
                >
                  取消导入
                </button>
              </div>
              <div className="metric-units">
                {draft.metrics.map((m, i) => (
                  <label key={m.key}>
                    {m.key}单位
                    <input
                      value={m.unit}
                      maxLength={12}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          metrics: d.metrics.map((v, j) =>
                            i === j ? { ...v, unit: e.target.value } : v,
                          ),
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
              <DataTable dataset={draft} onChange={setDraft} editing />
              <div className="confirm-row">
                <span>
                  <Info size={15} />
                  可直接编辑单元格；空白数值视为缺失。
                </span>
                <button
                  className="primary-button"
                  onClick={confirmDraft}
                  disabled={busy}
                >
                  <CheckCheck size={17} />
                  确认并生成图表
                </button>
              </div>
            </section>
          ) : dataset ? (
            <>
              <div className="tabs-row">
                <div className="tabs" role="tablist" aria-label="分析视图">
                  {[
                    ["chart", "可视化", ChartNoAxesColumnIncreasing],
                    ["data", "数据表", Table2],
                    ["report", "分析报告", FileText],
                  ].map(([id, label, Icon]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={tab === id}
                      className={tab === id ? "active" : ""}
                      onClick={() => setTab(id)}
                    >
                      <Icon size={16} />
                      {label}
                    </button>
                  ))}
                </div>
                <span className="saved-state">
                  <Check size={14} />
                  {records.status === "saved" ? "已保存到账号" : "自动保存中"}
                </span>
              </div>
              {tab === "chart" ? (
                <>
                  <div className="analysis-body">
                    <section className="chart-panel">
                      <div className="section-heading">
                        <div>
                          <h2>
                            {metric.key}
                            {chart === "line"
                              ? "变化趋势"
                              : chart === "pie"
                                ? "构成分析"
                                : "分类对比"}
                          </h2>
                          <p className="subtle">
                            {dataset.rows.length} 行原始数据 →{" "}
                            {analyzed.rows.length} 组结果，按
                            {sort ? "数值降序" : "原始顺序"}展示
                          </p>
                        </div>
                        <div className="chart-type" aria-label="图表类型">
                          {[
                            ["bar", "柱状图", ChartNoAxesColumnIncreasing],
                            ["line", "折线图", ChartLine],
                            ["pie", "占比图", ChartPie],
                          ].map(([v, label, Icon]) => (
                            <button
                              key={v}
                              aria-label={label}
                              aria-pressed={chart === v}
                              className={chart === v ? "selected" : ""}
                              onClick={() => setChart(v)}
                            >
                              <Icon size={17} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div className="chart-toolbar">
                        <label className="metric-select">
                          分组
                          <select
                            aria-label="分组字段"
                            value={view?.groupBy || ""}
                            onChange={(e) =>
                              setView((v) => ({
                                ...v,
                                groupBy: e.target.value,
                                granularity: "none",
                              }))
                            }
                          >
                            <option value="">原始记录</option>
                            {dimensionsFor(dataset).map((d) => (
                              <option key={d.key} value={d.key}>
                                {d.key === "name" ? "分类" : d.key}
                              </option>
                            ))}
                          </select>
                        </label>
                        {dimensionsFor(dataset).find(
                          (d) => d.key === view?.groupBy,
                        )?.type === "date" && (
                          <label className="metric-select">
                            粒度
                            <select
                              aria-label="时间粒度"
                              value={view?.granularity || "none"}
                              onChange={(e) =>
                                setView((v) => ({
                                  ...v,
                                  granularity: e.target.value,
                                }))
                              }
                            >
                              <option value="none">原日期</option>
                              <option value="day">按日</option>
                              <option value="month">按月</option>
                              <option value="year">按年</option>
                            </select>
                          </label>
                        )}
                        {view?.groupBy && (
                          <label className="metric-select">
                            汇总
                            <select
                              aria-label="汇总方式"
                              value={view?.aggregation || "auto"}
                              onChange={(e) =>
                                setView((v) => ({
                                  ...v,
                                  aggregation: e.target.value,
                                }))
                              }
                            >
                              <option value="auto">自动口径</option>
                              <option value="sum">求和</option>
                              <option value="average">平均值</option>
                              <option value="count">有效记录数</option>
                              <option value="min">最小值</option>
                              <option value="max">最大值</option>
                            </select>
                          </label>
                        )}
                        <label className="metric-select">
                          指标
                          <select
                            aria-label="指标"
                            value={metric.key}
                            onChange={(e) => setMetricKey(e.target.value)}
                          >
                            {dataset.metrics.map((m) => (
                              <option key={m.key} value={m.key}>
                                {m.key}
                                {m.unit ? `（${m.unit}）` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          className={
                            sort ? "text-button sorted" : "text-button"
                          }
                          onClick={() => setSort(!sort)}
                        >
                          <ChevronsUpDown size={14} />
                          {sort ? "恢复原始顺序" : "按数值排序"}
                        </button>
                      </div>
                      <p className="view-description">
                        {view?.groupBy
                          ? `按${view.groupBy === "name" ? "分类" : view.groupBy}${view.granularity === "month" ? "（月）" : view.granularity === "year" ? "（年）" : ""}分组；${metric.key}使用${{ sum: "求和", average: "平均值", count: "有效记录计数", min: "最小值", max: "最大值" }[aggregationFor(metric, view.aggregation)]}`
                          : "按原始记录展示"}
                        {view?.filters?.length
                          ? `；已应用 ${view.filters.length} 个筛选条件`
                          : ""}
                      </p>
                      {view?.filters?.length > 0 && (
                        <div className="active-filters">
                          {view.filters.map((f, i) => (
                            <span key={i}>
                              {f.field}{" "}
                              {
                                {
                                  eq: "=",
                                  in: "属于",
                                  contains: "包含",
                                  gte: "≥",
                                  lte: "≤",
                                }[f.op]
                              }{" "}
                              {Array.isArray(f.value) ? f.value.join("、") : f.value}
                            </span>
                          ))}
                          <button
                            onClick={() =>
                              setView((v) => ({ ...v, filters: [] }))
                            }
                          >
                            清除筛选
                          </button>
                        </div>
                      )}
                      <div className="hero-stat">
                        <span>{metric.key}合计</span>
                        <div>
                          {format(stats.total)}
                          <small>{metric.unit}</small>
                        </div>
                      </div>
                      <ChartBoundary>
                        <Suspense
                          fallback={
                            <div className="chart-box processing">
                              <LoaderCircle size={18} className="spin" />
                              正在准备图表…
                            </div>
                          }
                        >
                          <ChartView
                            data={displayed}
                            metric={metric}
                            type={chart}
                          />
                        </Suspense>
                      </ChartBoundary>
                      <div className="chart-footnote">
                        <span>
                          <span className="legend-line" />
                          {metric.key}
                        </span>
                        <span>缺失值不参与计算</span>
                      </div>
                    </section>
                    <aside className="insight-panel">
                      <h2>
                        <Sparkles size={17} />
                        看见数据里的线索
                      </h2>
                      <span className="method-tag">确定性统计</span>
                      <div className="finding">
                        <span>最高值</span>
                        <strong>
                          {stats.leaders.length
                            ? stats.leaders.join("、")
                            : "暂无有效值"}
                        </strong>
                        <p>
                          {format(stats.max)} <small>{metric.unit}</small>
                        </p>
                      </div>
                      <div className="finding">
                        <span>
                          {view?.groupBy ? "每组结果平均" : "每条记录平均"}
                        </span>
                        <strong className="numeric">
                          {format(stats.average)} <small>{metric.unit}</small>
                        </strong>
                        <p className="muted-note">
                          合计 ÷ {stats.count} 个有效值
                        </p>
                      </div>
                      <div className="quality">
                        <div>
                          <CheckCheck size={16} />
                          <strong>数据检查</strong>
                        </div>
                        <p>
                          {stats.missing
                            ? `${stats.missing} 个缺失值已排除。`
                            : "当前指标没有缺失值。"}
                          {new Set(dataset.rows.map((r) => r.name)).size <
                          dataset.rows.length
                            ? view?.groupBy
                              ? "原始记录包含重复分类，已按当前分组汇总。"
                              : "存在重名分类，按独立记录计算。"
                            : "分类名称无重复。"}
                        </p>
                      </div>
                      <div className="boundary">
                        <Info size={15} />
                        <p>数值变化不等于因果关系。进一步解释需要更多背景。</p>
                      </div>
                    </aside>
                  </div>
                  {(view?.groupBy || view?.filters?.length > 0) && (
                    <details className="source-preview chart-result-table">
                      <summary>
                        当前图表数据（{analyzed.rows.length} 组）
                      </summary>
                      <DataTable dataset={displayed} />
                    </details>
                  )}
                  <section className="source-preview">
                    <div className="section-heading">
                      <h2>
                        <Table2 size={16} />
                        {view?.filters?.length ? "当前筛选的原始数据" : "回到原始数据"}{" "}
                        <span className="count-label">
                          {filteredSource.rows.length} 行{view?.filters?.length ? ` / 共 ${dataset.rows.length} 行` : ""}
                        </span>
                      </h2>
                      <button
                        className="text-button"
                        onClick={() => setTab("data")}
                      >
                        {view?.filters?.length ? "查看筛选明细" : "查看与编辑"}
                        <ArrowUpRight size={15} />
                      </button>
                    </div>
                    <DataTable dataset={filteredSource} limit={3} />
                    <div className="source-caption">
                      <Link2 size={13} />
                      {dataset.source}
                    </div>
                  </section>
                </>
              ) : tab === "data" ? (
                <section className="data-panel">
                  <div className="section-heading">
                    <h2>
                      {view?.filters?.length && !editing ? "筛选后的原始数据" : "原始数据"}{" "}
                      <span className="count-label">
                        {editing ? dataset.rows.length : filteredSource.rows.length} 行{view?.filters?.length && !editing ? ` / 共 ${dataset.rows.length} 行` : ""}
                      </span>
                    </h2>
                    <div className="row-actions">
                      <button
                        className="secondary-button"
                        onClick={() => {
                          download(
                            `${dataset.title}.csv`,
                            csvExport(editing ? dataset : filteredSource),
                            "text/csv;charset=utf-8",
                          );
                          setNotice("CSV 已导出");
                        }}
                      >
                        <Download size={15} />
                        导出 CSV
                      </button>
                      <button
                        className="secondary-button"
                        onClick={() => {
                          if (editing) {
                            try {
                              validateDataset(dataset);
                              setEditing(false);
                              setError("");
                            } catch (e) {
                              setError(e.message);
                            }
                          } else setEditing(true);
                        }}
                      >
                        {editing ? (
                          <Check size={15} />
                        ) : (
                          <SlidersHorizontal size={15} />
                        )}{" "}
                        {editing ? "完成编辑" : view?.filters?.length ? "编辑全部原始数据" : "编辑数据"}
                      </button>
                    </div>
                  </div>
                  <p className="subtle">
                    {editing
                      ? "正在编辑全部原始数据。修改会立即更新计算与图表；完成编辑后返回当前筛选明细。清空数值表示缺失，输入 0 表示零。"
                      : view?.filters?.length ? "明细与图表使用相同的筛选条件，保留原始记录，不进行分组汇总；导出 CSV 仅包含这些明细。" : "当前分析会自动保存到你的账号，也可以导出 CSV。"}
                  </p>
                  <DataTable
                    dataset={editing ? dataset : filteredSource}
                    onChange={updateDataset}
                    editing={editing}
                  />
                  <div className="source-caption">
                    <Link2 size={13} />
                    {dataset.source}
                  </div>
                </section>
              ) : (
                <section className="report-overview">
                  <FileText size={32} />
                  <h2>{savedReport ? "本次分析报告" : "让 AI 将本次分析整理成报告"}</h2>
                  {savedReport ? <>
                    <p className="report-generated-meta">{savedReport.mode === "ai" ? `${savedReport.model} · 深度分析` : "程序统计报告"} · {savedReport.pages} 页 · {savedReport.chartCount} 幅专题图表 · {new Date(savedReport.createdAt).toLocaleString("zh-CN")}</p>
                    {!currentReport && <p className="subtle">报告范围、当前数据或问题已变化，以下为上次保存的版本。点击重新生成，可获得整份数据的报告与独立问题专题。</p>}
                    <p>{savedReport.narrative.summary}</p>
                    <h3>{savedReport.reportScope === "overall" ? "整体分析结论" : "原报告分析结论"}</h3><p>{savedReport.narrative.answer}</p>
                    <h3>报告中的专题分析</h3>
                    <ol>{savedReport.narrative.chapters.map(c => <li key={c.chartId}>{c.title}</li>)}</ol>
                    {savedReport.narrative.questionSection && <>
                      <h3>用户问题专题 · 1—2 页</h3>
                      <p>{savedReport.narrative.questionSection.answer}</p>
                      <ol>{savedReport.narrative.questionSection.chapters.slice(0, 2).map(c => <li key={c.chartId}>{c.title}</li>)}</ol>
                    </>}
                  </> : <>
                    <p>由 MiMo 对整份数据进行全面分析，展示整体趋势、构成、差异和数据质量；另设 1—2 页专题，结合当前筛选回应你的问题。生成后可预览 PDF 再导出。</p>
                    <ol><li>核对全部数据，形成整体概况与核心发现</li><li>分析趋势、构成与差异，给出图表和行动建议</li><li>单列用户问题专题，标明筛选范围与计算依据</li></ol>
                  </>}
                  <div className="report-preview-actions">
                    <button className="primary-button" onClick={() => openReport(false, true)} disabled={busy || editing}><Sparkles size={16} />{savedReport ? "预览与导出报告" : "开始 AI 深度生成"}</button>
                    {savedReport && <button className="text-button" disabled={busy || editing} onClick={() => openReport(true)}>重新生成</button>}
                  </div>
                </section>
              )}
            </>
          ) : (
            <section
              className="empty-state"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (!busy) importFile(e.dataTransfer.files[0]);
              }}
            >
              <div className="empty-symbol">
                <ChartNoAxesColumnIncreasing size={42} strokeWidth={1} />
              </div>
              <h2>每个数字，都值得看清楚</h2>
              <p>上传一份文件，或者把数据直接说出来。</p>
              <button
                className="primary-button"
                onClick={() => fileRef.current.click()}
                disabled={busy}
              >
                <Upload size={17} />
                添加数据文件
              </button>
              <button
                className="text-button"
                onClick={() => {
                  setText(clubText);
                  setSidebar(true);
                  inputRef.current?.focus();
                }}
              >
                试试用一句话录入
                <ArrowRight size={16} />
              </button>
              <span className="subtle">支持拖放表格、结构化数据和文本文件</span>
              {previous && (
                <button
                  className="text-button"
                  onClick={() => {
                    setDataset(previous);
                    setMetricKey(previous.metrics[0].key);
                    setPrevious(null);
                    setTab("chart");
                  }}
                >
                  <RotateCcw size={15} />
                  恢复上一次数据
                </button>
              )}
            </section>
          )}
          <footer className="workspace-footer">
            <span>见数，让分析有据可循。</span>
            <button
              className="text-button"
              onClick={() => fileRef.current.click()}
              disabled={busy}
            >
              <Upload size={14} />
              导入数据
            </button>
          </footer>
        </main>
      </fieldset>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,.tsv,.xlsx,.json,.txt"
        className="sr-only"
        aria-label="选择数据文件"
        onChange={(e) => importFile(e.target.files[0])}
      />
      {!sidebar && (
        <button className="ai-floating-entry" onClick={focusAI}>
          <Sparkles size={20} />
          AI 分析助手
        </button>
      )}
      {notice && (
        <div className="toast" role="status">
          <Check size={16} />
          {notice}
        </div>
      )}
      {reportInput && (
        <ReportStudio
          input={reportInput}
          onClose={() => setReportInput(null)}
          initialResult={reportInput.cachedResult}
          onResult={result => {
            if (user?.username === reportInput.owner && records.activeId === reportInput.recordId)
              setStoredReport(serializeReport(reportInput.key, result));
          }}
        />
      )}
    </div>
  );
}
