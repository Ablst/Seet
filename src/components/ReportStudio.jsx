import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileText,
  Check,
  LoaderCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Minus,
  Plus,
} from "lucide-react";
import { requestReport } from "../reportApi.mjs";
import "../report.css";
function PdfPreview({ bytes, onReady }) {
  const [pdf, setPdf] = useState(null),
    [page, setPage] = useState(1),
    [width, setWidth] = useState(760),
    [height, setHeight] = useState(800),
    [fit, setFit] = useState("custom"),
    [zoom, setZoom] = useState(1.8),
    [actualScale, setActualScale] = useState(1.8),
    [error, setError] = useState(""),
    [rendering, setRendering] = useState(true);
  const canvas = useRef(null),
    container = useRef(null),
    notify = useRef(onReady);
  notify.current = onReady;
  useEffect(() => {
    let stopped = false,
      task;
    (async () => {
      try {
        const lib = await import("pdfjs-dist/legacy/build/pdf.mjs");
        const worker = await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs?url");
        lib.GlobalWorkerOptions.workerSrc = worker.default;
        task = lib.getDocument({ data: bytes.slice() });
        const doc = await task.promise;
        if (stopped) {
          doc.destroy();
          return;
        }
        setPdf(doc);
      } catch (e) {
        console.error("PDF preview initialization", e);
        if (!stopped) setError("PDF 预览加载失败，仍可直接下载报告查看。");
      }
    })();
    return () => {
      stopped = true;
      task?.destroy();
    };
  }, [bytes]);
  useEffect(() => {
    const observer = new ResizeObserver((items) => {
      setWidth(items[0].contentRect.width);
      setHeight(items[0].contentRect.height);
    });
    observer.observe(container.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    container.current?.scrollTo({ top: 0 });
  }, [page]);
  useEffect(() => {
    if (!pdf) return;
    let stopped = false,
      task;
    setRendering(true);
    (async () => {
      try {
        const current = await pdf.getPage(page);
        if (stopped) return;
        const normal = current.getViewport({ scale: 1 }),
          scale = Math.max(0.2, Math.min(3.5,
            fit === "width" ? (width - 48) / normal.width : fit === "page"
              ? Math.min((width - 48) / normal.width, (height - 24) / normal.height) : zoom)),
          ratio = Math.min(devicePixelRatio || 1, 2),
          viewport = current.getViewport({ scale: scale * ratio }),
          el = canvas.current;
        setActualScale(scale);
        el.width = viewport.width;
        el.height = viewport.height;
        el.style.width = viewport.width / ratio + "px";
        el.style.height = viewport.height / ratio + "px";
        task = current.render({ canvasContext: el.getContext("2d"), viewport });
        await task.promise;
        if (!stopped) {
          setRendering(false);
          notify.current();
        }
      } catch (e) {
        if (!stopped && e.name !== "RenderingCancelledException")
          setError("PDF 当前页渲染失败，请直接下载查看。");
      }
    })();
    return () => {
      stopped = true;
      task?.cancel();
    };
  }, [pdf, page, width, height, fit, zoom]);
  function changeZoom(amount) {
    setZoom(Math.max(0.3, Math.min(3.5, actualScale + amount)));
    setFit("custom");
  }
  return (
    <>
      <div className="report-canvas-scroll" ref={container}>
        {error ? (
          <p role="alert" className="report-preview-error">
            {error}
          </p>
        ) : (
          <div className="report-canvas-wrap">
            {rendering && (
              <span className="report-rendering">
                <LoaderCircle className="spin" size={16} />
                正在准备预览…
              </span>
            )}
            <canvas
              ref={canvas}
              role="img"
              aria-label={`PDF 分析报告，第 ${page} 页`}
            />
          </div>
        )}
      </div>
      <footer className="report-viewer-footer">
        <div className="report-zoom-controls" aria-label="PDF 缩放">
          <button onClick={() => setFit("width")} aria-pressed={fit === "width"}>适宽</button>
          <button onClick={() => setFit("page")} aria-pressed={fit === "page"}>整页</button>
          <button aria-label="缩小 PDF" onClick={() => changeZoom(-0.15)}><Minus size={16} /></button>
          <span>{Math.round(actualScale * 100)}%</span>
          <button aria-label="放大 PDF" onClick={() => changeZoom(0.15)}><Plus size={16} /></button>
        </div>
        <nav className="report-page-controls" aria-label="PDF 翻页">
          <button aria-label="上一页报告" disabled={!pdf || page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={20} /><span>上一页</span></button>
          <span className="report-page-counter" aria-live="polite">第 {page} / {pdf?.numPages || "…"} 页</span>
          <button className="report-page-next" aria-label="下一页报告" disabled={!pdf || page >= pdf.numPages} onClick={() => setPage(p => p + 1)}><span>下一页</span><ChevronRight size={20} /></button>
        </nav>
      </footer>
    </>
  );
}
export default function ReportStudio({ input, onClose, initialResult, onResult }) {
  const dialog = useRef(null),
    controller = useRef(null),
    run = useRef(0);
  const [status, setStatus] = useState(initialResult ? "ready" : "loading"),
    [progress, setProgress] = useState({
      stage: 0,
      text: "正在核对数据与统计口径",
    }),
    [result, setResult] = useState(initialResult || null),
    [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [statistical, setStatistical] = useState(false);
  const resultCallback = useRef(onResult);
  resultCallback.current = onResult;
  async function generate(allowStatistical = false) {
    const token = ++run.current;
    controller.current?.abort();
    const abort = new AbortController();
    controller.current = abort;
    setStatus("loading");
    setStatistical(allowStatistical);
    setError("");
    setResult(null);
    setProgress({ stage: 0, text: "正在核对数据与统计口径" });
    try {
      const data = await requestReport(
        { ...input, allowStatistical },
        (event) => {
          if (run.current === token) setProgress(event);
        },
        abort.signal,
      );
      if (run.current !== token) return;
      setProgress({ stage: 2, text: "PDF 已生成，正在准备预览" });
      setResult(data);
      resultCallback.current?.(data);
      setStatus("ready");
    } catch (e) {
      if (run.current !== token || abort.signal.aborted) return;
      setError(e.message || "报告生成失败，请重试。");
      setStatus("error");
    }
  }
  useEffect(() => {
    dialog.current.showModal();
    let mounted = true;
    queueMicrotask(() => {
      if (mounted && !initialResult) generate();
    });
    return () => {
      mounted = false;
      run.current++;
      controller.current?.abort();
    };
  }, []);
  useEffect(() => {
    if (!result) {
      setUrl("");
      return;
    }
    const next = URL.createObjectURL(
      new Blob([result.bytes], { type: "application/pdf" }),
    );
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [result]);
  return (
    <dialog
      ref={dialog}
      className="report-studio"
      aria-label="分析报告生成与预览"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className="report-studio-header">
        <button onClick={onClose} className="report-back">
          <ArrowLeft size={18} />
          <span>返回分析</span>
        </button>
        <div className="report-document-title">
          <FileText size={18} />
          <strong>{result?.title || input.dataset.title}</strong>
          <span>分析报告</span>
        </div>
        <div className="report-header-actions">
          {status === "ready" && (
            <>
              <button onClick={() => generate()} className="report-regenerate" aria-label="重新生成">
                <RotateCcw size={15} />
                <span>重新生成</span>
              </button>
              <a
                className="report-download"
                href={url || undefined}
                download={result.fileName}
                aria-disabled={!url}
              >
                <Download size={16} />
                导出 PDF
              </a>
            </>
          )}
        </div>
      </header>
      {status === "loading" ? (
        <div className="report-generating" role="status" aria-live="polite">
          <div className="report-generating-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <h1>{statistical ? "正在生成统计报告" : "正在生成 AI 分析报告"}</h1>
          <p>{progress.text}</p>
          {input.history?.some(m => m.role === "user") && <p className="report-focus-question">本次关注：{input.history.filter(m => m.role === "user").at(-1).text.slice(0, 160)}</p>}
          <ol>
            {["核对数据、对话与分析问题", statistical ? "整理统计结果与图表" : "MiMo 深度思考与撰写专题", "复核图表、排版与 PDF 预览"].map(
              (label, index) => (
                <li
                  key={label}
                  className={
                    index < progress.stage
                      ? "complete"
                      : index === progress.stage
                        ? "current"
                        : ""
                  }
                >
                  {index < progress.stage ? (
                    <Check size={17} />
                  ) : index === progress.stage ? (
                    <LoaderCircle size={17} className="spin" />
                  ) : (
                    <FileText size={17} />
                  )}
                  <span>{label}</span>
                </li>
              ),
            )}
          </ol>
          <button onClick={onClose} className="report-cancel">
            取消生成
          </button>
        </div>
      ) : status === "error" ? (
        <div className="report-generating">
          <FileText size={36} />
          <h1>报告暂未生成</h1>
          <p role="alert">{error}</p>
          <button className="primary-button" onClick={() => generate()}>重试 AI 生成</button>
          <button className="report-cancel" onClick={() => generate(true)}>仅生成统计报告</button>
        </div>
      ) : (
        <>
          <div className="report-ready-notice">
            <span>
              <Check size={15} />
              报告已生成，共 {result.pages} 页
            </span>
            <span>
              {result.mode === "ai" ? (
                <>
                  <Sparkles size={14} />
                  MiMo AI 解读
                </>
              ) : (
                "程序统计解读"
              )}
            </span>
            <small>{result.notice}</small>
            {input.previousVersion && result === input.cachedResult && <small>正在预览上次保存的报告；重新生成会使用当前分析状态。</small>}
          </div>
          <PdfPreview bytes={result.bytes} onReady={() => {}} />
        </>
      )}
    </dialog>
  );
}
