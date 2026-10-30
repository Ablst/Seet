import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChartNoAxesColumnIncreasing,
  FileSpreadsheet,
  MessageSquare,
  Sparkles,
  Eye,
  EyeOff,
  LoaderCircle,
  UserRound,
  LockKeyhole,
} from "lucide-react";
import { apiRequest } from "./api.mjs";
import { LoginShell } from "./Experience.jsx";
import { captureLoginArrival } from "./loginArrival.js";

export function HelpPage({ navigate }) {
  return (
    <main className="help-page subpage">
      <div className="subpage-intro">
        <h1>
          把数字交给 AI，
          <br />
          把判断留给你。
        </h1>
        <p>
          从一段描述、一份表格开始。见数帮你整理数据，核对后生成图表，让每个结果都有依据。
        </p>
        <button className="primary-button" onClick={() => navigate("/")}>
          <ArrowLeft size={16} />
          返回分析空间
        </button>
      </div>
      <div className="guide-content">
        <section className="guide-section">
          <div>
            <MessageSquare size={22} />
            <h2>用一句话，开始分析</h2>
            <p>
              在“AI 分析助手”输入框中填写分类、数值和单位，点击箭头发送。也支持
              Ctrl + Enter。
            </p>
            <div className="example-text">
              摄影社报名80人、到场62人；篮球社报名120人、到场108人；读书会报名50人、到场45人。
            </div>
            <p>
              AI
              会通过工具整理数据并生成图表。你可以继续要求分组、筛选或更换图表，并在消息中展开查看实际执行过程。
            </p>
          </div>
        </section>
        <section className="guide-section">
          <div>
            <FileSpreadsheet size={22} />
            <h2>也可以，从文件开始</h2>
            <p>
              点击“添加数据文件”，或将文件拖到空白工作台。支持
              Excel（.xlsx）、CSV、TSV、JSON 和 TXT。
            </p>
            <div className="guide-table">
              <table>
                <thead>
                  <tr>
                    <th>社团</th>
                    <th>报名人数（人）</th>
                    <th>到场人数（人）</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>摄影社</td>
                    <td>80</td>
                    <td>62</td>
                  </tr>
                  <tr>
                    <td>篮球社</td>
                    <td>120</td>
                    <td>108</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              Excel
              读取第一张工作表，第一行为表头。保留日期、门店等多个分类字段；单文件不超过
              20 MB，最多 50000 行、32
              个数值指标。原始数据分页展示，不会只保留当前页。TXT 的文字由 AI
              整理。
            </p>
          </div>
        </section>
        <section className="guide-section">
          <div>
            <ChartNoAxesColumnIncreasing size={22} />
            <h2>继续追问，看清规律</h2>
            <p>
              可以说“换成折线图”“按数值从高到低排序”，或“这组数据最高是多少”。AI
              会结合当前数据回答，并执行支持的图表操作。
            </p>
            <p>
              可以说“按月汇总用电量，生成饼图”或“只看湖畔店，按月统计营业额”。饼图支持十二个月等多分类数据；有负值、缺失值或全部为零时会说明原因，不会静默切换成其他图形。
            </p>
          </div>
        </section>
        <section className="guide-section">
          <div>
            <Check size={22} />
            <h2>核对依据，保存结果</h2>
            <p>
              “数据表”中可以修正数值、导出 CSV；“分析报告”由 MiMo
              结合本次对话深度生成，点击生成后可查看进度，再预览并下载多页
              PDF。预览支持适宽、整页和缩放，右下角可翻页。空白代表缺失，0
              会参与计算。合计与平均值由程序计算，重名分类按独立记录处理。
            </p>
            <p>
              分析会自动保存到当前登录账号，左侧“分析记录”可打开历史内容。保存状态显示成功后，刷新页面或重新登录即可恢复最近记录。不同账号的记录由服务端隔离。
            </p>
          </div>
        </section>
        <section className="guide-note">
          <Sparkles size={20} />
          <div>
            <h2>关于 AI 和数据</h2>
            <p>
              文字描述和对当前数据的提问由 Xiaomi MiMo
              处理，提问时会附带当前表格和计算结果。结构化文件首先在浏览器读取。请核对
              AI 整理结果；数值趋势只能说明现象，不能单独证明原因。
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

export function LoginPage({ navigate, onLogin, user }) {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [visible, setVisible] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function submit(e) {
    e.preventDefault();
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      const result = await apiRequest(
        "/api/auth/" + (register ? "register" : "login"),
        { username: username.trim(), password },
      );
      captureLoginArrival();
      onLogin(result.user);
      navigate("/home");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <LoginShell navigate={navigate}>
      <div className="login-form-wrap">
        {user ? (
          <>
            <div className="login-symbol">
              <UserRound size={24} />
            </div>
            <h2>你好，{user.username}</h2>
            <p className="login-description">你的账号已就绪，继续探索见数。</p>
            <button
              className="primary-button login-submit"
              onClick={() => navigate("/home")}
            >
              前往主页
              <ArrowRight size={17} />
            </button>
          </>
        ) : (
          <>
            <div className="login-symbol">
              <Sparkles size={24} />
            </div>
            <h2>{register ? "创建你的账号" : "欢迎回到见数"}</h2>
            <p className="login-description">
              {register
                ? "注册后，即可使用你的个人身份登录。"
                : "登录账号，开始一次新的数据发现。"}
            </p>
            <div className="auth-tabs">
              <button
                type="button"
                className={!register ? "selected" : ""}
                aria-pressed={!register}
                onClick={() => {
                  setRegister(false);
                  setError("");
                }}
              >
                登录
              </button>
              <button
                type="button"
                className={register ? "selected" : ""}
                aria-pressed={register}
                onClick={() => {
                  setRegister(true);
                  setError("");
                }}
              >
                注册
              </button>
            </div>
            <form onSubmit={submit}>
              <label className="auth-label" htmlFor="username">
                用户名
              </label>
              <div className="auth-input">
                <UserRound size={17} />
                <input
                  id="username"
                  name="username"
                  spellCheck={false}
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  maxLength={24}
                  minLength={3}
                  required
                  placeholder="输入用户名"
                />
              </div>
              <label className="auth-label" htmlFor="password">
                密码
              </label>
              <div className="auth-input">
                <LockKeyhole size={17} />
                <input
                  id="password"
                  name="password"
                  type={visible ? "text" : "password"}
                  autoComplete={register ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={register ? 8 : 1}
                  maxLength={128}
                  required
                  placeholder={register ? "设置至少 8 位密码" : "输入密码"}
                />
                <button
                  type="button"
                  className="icon-button"
                  aria-label={visible ? "隐藏密码" : "显示密码"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              {register && (
                <p className="auth-hint">
                  用户名 3–24 位，支持文字、数字、下划线和短横线。
                </p>
              )}
              {error && (
                <p className="auth-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="primary-button login-submit"
                disabled={busy}
              >
                {busy ? <LoaderCircle size={18} className="spin" /> : null}
                {busy ? "正在处理…" : register ? "注册并登录" : "登录"}
                {!busy && <ArrowRight size={17} />}
              </button>
            </form>
            <p className="auth-scope">
              登录后，你的对话、表格和图表会保存到专属分析记录。
            </p>
          </>
        )}
      </div>
    </LoginShell>
  );
}
