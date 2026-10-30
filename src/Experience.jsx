import { useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUpRight,
  FileText,
  Mic,
  Table2,
  Check,
} from "lucide-react";
import { playLoginArrival } from "./loginArrival.js";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ScrollToPlugin } from "gsap/ScrollToPlugin";
import { useGSAP } from "@gsap/react";
import Brand from "./components/Brand.jsx";
import DataSculpture from "./components/DataSculpture.jsx";
import "./experience.css";

gsap.registerPlugin(useGSAP, ScrollTrigger, ScrollToPlugin);

function RouteLink({ to, navigate, children, className = "", ...props }) {
  return (
    <a
      href={to}
      className={className}
      {...props}
      onClick={(event) => {
        if (
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey
        )
          return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

function SectionLink({ href, children, ...props }) {
  const root = useRef(null);
  const { contextSafe } = useGSAP(() => {}, { scope: root });
  const scroll = contextSafe((event) => {
    if (
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const target = document.querySelector(href);
    if (!target) return;
    event.preventDefault();
    if (location.hash !== href) history.pushState(null, "", href);
    const focus = () => target.focus({ preventScroll: true });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      target.scrollIntoView();
      focus();
      return;
    }
    gsap.to(window, {
      scrollTo: { y: target, offsetY: 28, autoKill: true },
      duration: 0.9,
      ease: "power3.inOut",
      overwrite: "auto",
      onComplete: focus,
    });
  });
  return (
    <a ref={root} href={href} {...props} onClick={scroll}>
      {children}
    </a>
  );
}

export function LoginShell({ children, navigate }) {
  const root = useRef(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({ defaults: { duration: 0.8, ease: "power3.out" } })
          .from(
            ".login-story-copy > *",
            { y: 24, opacity: 0, stagger: 0.12 },
            0,
          )
          .from(".login-form-wrap", { y: 20, opacity: 0 }, 0.25);
      });
      return () => media.revert();
    },
    { scope: root },
  );
  return (
    <main className="seet-experience login-experience" ref={root}>
      <a className="experience-skip" href="#login-form">
        跳到登录表单
      </a>
      <section className="login-visual" aria-label="见数 AI 数据分析">
        <div className="login-brand">
          <Brand light />
          <span>AI 数据分析，始于一句话</span>
        </div>
        <div className="login-story-copy">
          <h1>
            数据的下一步，
            <br />
            是你的新发现。
          </h1>
          <p>把零散的数字，变成看得见的答案。</p>
        </div>
        <DataSculpture />
        <div className="login-visual-foot">
          <span>让每个数字，都值得看清楚。</span>
          <span translate="no">Seet / 见数</span>
        </div>
      </section>
      <section className="login-entry" id="login-form">
        <div className="login-entry-top">
          <Brand />
          <span>你的数据发现之旅</span>
        </div>
        {children}
        <div className="login-entry-foot">
          <span>放石一马团队</span>
          <span>思考由小米 MiMo 提供支持</span>
        </div>
      </section>
    </main>
  );
}

const values = [120, 150, 90, 180, 210, 280, 230];
const weekdays = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

function SampleChart({ kind }) {
  const root = useRef(null);
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from(".sample-mark", {
          scaleY: 0,
          transformOrigin: "50% 100%",
          stagger: 0.035,
          duration: 0.65,
          ease: "power3.out",
        });
      });
      return () => media.revert();
    },
    { scope: root, dependencies: [kind], revertOnUpdate: true },
  );
  const points = values
    .map((value, i) => `${58 + i * 70},${250 - value * 0.65}`)
    .join(" ");
  return (
    <svg
      ref={root}
      className="sample-chart"
      viewBox="0 0 540 300"
      role="img"
      aria-label={`一周咖啡销量${kind === "line" ? "折线图" : "柱状图"}，周六销量最高，为280杯`}
    >
      {[0, 100, 200, 300].map((value) => (
        <text className="sample-y" x="10" y={254 - value * 0.65} key={value}>
          {value}
        </text>
      ))}
      {kind === "line" ? (
        <g key="line" className="sample-mark">
          <polyline className="sample-line" points={points} />
          {values.map((value, i) => (
            <circle
              className="sample-point"
              key={i}
              cx={58 + i * 70}
              cy={250 - value * 0.65}
              r="5"
            />
          ))}
        </g>
      ) : (
        values.map((value, i) => (
          <rect
            key={i}
            className={`sample-mark sample-bar ${i === 5 ? "sample-peak" : ""}`}
            x={40 + i * 70}
            y={250 - value * 0.65}
            width="36"
            height={value * 0.65}
            rx="5"
          />
        ))
      )}
      {values.map((value, i) => (
        <g key={i}>
          <text
            className="sample-value"
            x={58 + i * 70}
            y={234 - value * 0.65}
            textAnchor="middle"
          >
            {value}
          </text>
          <text
            className="sample-day"
            x={58 + i * 70}
            y="282"
            textAnchor="middle"
          >
            {weekdays[i]}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function HomePage({ navigate, user, accountControls }) {
  const root = useRef(null);
  const [kind, setKind] = useState("bar");
  useGSAP(
    () => {
      const media = gsap.matchMedia();
      media.add("(prefers-reduced-motion: no-preference)", () => {
        const arrivalCleanup = playLoginArrival(root.current);
        if (!arrivalCleanup)
          gsap
            .timeline({ defaults: { ease: "power3.out", duration: 0.9 } })
            .from(
              ".home-hero-copy > *",
              { y: 32, opacity: 0, stagger: 0.1 },
              0.1,
            )
            .from(".home-hero-note", { opacity: 0, y: 16 }, 0.65);
        gsap.to(".home-scroll-cue svg", {
          y: 7,
          duration: 0.85,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
        });
        // Only the report composition follows scroll; text remains readable at rest.
        gsap.from(".report-preview-sheet", {
          y: 65,
          rotation: 4,
          ease: "none",
          scrollTrigger: {
            trigger: ".home-report",
            start: "top 85%",
            end: "center center",
            scrub: 0.8,
          },
        });
        return () => arrivalCleanup?.();
      });
      return () => media.revert();
    },
    { scope: root },
  );
  return (
    <div className="seet-experience home-experience" ref={root}>
      <a className="experience-skip" href="#home-main">
        跳到主要内容
      </a>
      <div className="home-header-band">
        <header className="home-header experience-container">
          <RouteLink to="/home" navigate={navigate} aria-label="见数主页">
            <Brand />
          </RouteLink>
          <nav aria-label="主页导航">
            <SectionLink href="#discover">产品功能</SectionLink>
            <RouteLink to="/history" navigate={navigate}>
              分析记录
            </RouteLink>
            <RouteLink to="/help" navigate={navigate}>
              使用说明
            </RouteLink>
          </nav>
          <div className="home-header-actions">{accountControls}</div>
        </header>
      </div>
      <main id="home-main">
        <div className="home-hero-band">
          <section className="home-hero experience-container">
            <div className="home-hero-copy">
              <h1>
                让数据，
                <br />
                说得更清楚。
              </h1>
              <p>
                用一句话探索数据，
                <br />
                让图表和 AI 帮你发现其中的线索。
              </p>
              <div className="hero-actions">
                <RouteLink
                  to="/"
                  navigate={navigate}
                  className="experience-button"
                >
                  进入 AI 工作台
                  <ArrowUpRight size={20} aria-hidden="true" />
                </RouteLink>
              </div>
            </div>
            <div className="home-hero-art">
              <DataSculpture />
              <p className="home-hero-note">看见数据，也看见可能。</p>
            </div>
            <div className="home-hero-bottom">
              <p>
                你好，<span>{user.username}</span>。准备好开始一次新的发现了吗？
              </p>
              <SectionLink
                className="home-scroll-cue"
                href="#discover"
                aria-label="向下查看产品功能"
              >
                <ArrowDown size={22} aria-hidden="true" />
              </SectionLink>
            </div>
          </section>
        </div>
        <section
          className="home-discover experience-container"
          id="discover"
          tabIndex={-1}
        >
          <div className="discovery-heading">
            <h2>
              一个问题，
              <br />
              换一种看法。
            </h2>
            <p>
              比较高低，观察趋势。
              <br />
              在对话中提出需求，在图表里找到答案。
            </p>
          </div>
          <div className="sample-stage" data-ui>
            <div className="sample-conversation">
              <div className="sample-question">
                <span>你可以这样问</span>
                <p>
                  {kind === "bar"
                    ? "这一周，哪天咖啡卖得最多？"
                    : "换成折线图，看看这一周的销量变化。"}
                </p>
              </div>
              <div className="sample-answer">
                <Brand />
                <p>
                  周六销量最高，为 <strong>280 杯</strong>。一周共售出 1,260
                  杯，平均每天 180 杯。
                </p>
                <span className="sample-disclaimer">
                  示例数据，仅展示图表交互
                </span>
              </div>
            </div>
            <div className="sample-result">
              <div className="sample-result-head">
                <div>
                  <h3>一周咖啡销量</h3>
                  <span>销量 / 杯</span>
                </div>
                <div
                  className="sample-switch"
                  role="group"
                  aria-label="切换示例图表"
                >
                  <button
                    type="button"
                    aria-pressed={kind === "bar"}
                    onClick={() => setKind("bar")}
                  >
                    柱状图
                  </button>
                  <button
                    type="button"
                    aria-pressed={kind === "line"}
                    onClick={() => setKind("line")}
                  >
                    折线图
                  </button>
                </div>
              </div>
              <SampleChart kind={kind} />
              <div className="sample-finding">
                <Check size={17} aria-hidden="true" />
                <span>让变化可见，让结论有据。</span>
              </div>
            </div>
          </div>
        </section>
        <section className="home-inputs experience-container">
          <div className="input-intro">
            <h2>
              数据从哪里来，
              <br />
              就从哪里开始。
            </h2>
            <p>
              表格、文字，或是你的声音。
              <br />
              选择顺手的方式，把问题交给见数。
            </p>
          </div>
          <div className="input-methods">
            <div>
              <Table2 aria-hidden="true" />
              <h3>放入一份表格</h3>
              <p>导入 Excel、CSV 等数据文件，保留原始数据，继续探索。</p>
            </div>
            <div>
              <FileText aria-hidden="true" />
              <h3>直接说出数字</h3>
              <p>把零散记录写进对话，让 AI 整理成可分析的数据。</p>
            </div>
            <div>
              <Mic aria-hidden="true" />
              <h3>也可以，用声音</h3>
              <p>点击语音按钮，说出你的想法，识别后确认发送。</p>
            </div>
          </div>
        </section>
        <section className="home-report">
          <div className="experience-container report-layout">
            <div
              className="report-showcase"
              aria-label="一周咖啡销量分析报告示例"
            >
              <div className="report-preview-sheet">
                <div className="report-paper-head">
                  <Brand />
                  <span>分析报告示例</span>
                </div>
                <h3>
                  这一周的销售，
                  <br />
                  值得多看一眼。
                </h3>
                <p>一周咖啡销量分析</p>
                <div className="report-paper-metrics">
                  <div>
                    <span>一周总销量</span>
                    <strong>
                      1,260<small> 杯</small>
                    </strong>
                  </div>
                  <div>
                    <span>销量最高</span>
                    <strong>周六</strong>
                  </div>
                </div>
                <SampleChart kind="line" />
                <div className="report-paper-text">
                  <h4>从数字到发现</h4>
                  <p>
                    周六为一周销量峰值。结合每日趋势，进一步关注周末的备货与排班安排。
                  </p>
                </div>
              </div>
            </div>
            <div className="report-copy">
              <h2>
                探索之后，
                <br />
                把发现留下来。
              </h2>
              <p>
                结合完整数据与对话中的问题，
                <br />
                生成包含图表、结论与建议的分析报告。
              </p>
              <ul>
                <li>
                  <Check size={18} aria-hidden="true" />
                  整体分析与问题专题
                </li>
                <li>
                  <Check size={18} aria-hidden="true" />
                  预览确认，再导出 PDF
                </li>
                <li>
                  <Check size={18} aria-hidden="true" />
                  保存到你的分析记录
                </li>
              </ul>
            </div>
          </div>
        </section>
        <section className="home-closing experience-container">
          <h2>
            下一次发现，
            <br />
            从你的问题开始。
          </h2>
          <div>
            <p>
              一份数据，一句话。
              <br />
              现在，就交给见数。
            </p>
            <RouteLink to="/" navigate={navigate} className="experience-button">
              进入 AI 工作台
              <ArrowUpRight size={20} aria-hidden="true" />
            </RouteLink>
          </div>
        </section>
      </main>
      <footer className="home-footer experience-container">
        <Brand />
        <p>放石一马团队 / 见数 Seet</p>
        <span>思考由小米 MiMo 提供支持</span>
      </footer>
    </div>
  );
}
