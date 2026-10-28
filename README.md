# 见数 Seet · AI 数据分析工作台

通过自然语言、表格或语音描述数据，使用 AI 完成筛选、分组、统计和绘图，并生成可预览、可导出的 PDF 分析报告。

本仓库包含完整 React 前端、Node.js 后端、测试、依赖锁文件、模拟数据和运行配置。GitHub 用于托管源码；运行作品需要启动 Node.js 服务。

## 比赛与团队

| 项目 | 信息 |
| --- | --- |
| 赛事 | 2026 第九届传智杯全国大学生数智创新与 AI 应用大赛 |
| 赛道 | AI WEB 网页开发挑战赛 |
| 参赛形式 | 团队赛 |
| 组别 | B 组 |
| 团队名称 | 放石一马 |
| 团队编号 | 42657 |
| 所属院校 | 周口师范学院 |
| 团队成员 | 刘鹏洋、李文浩、张博睿 |
| 仓库维护 | [@Ablst](https://github.com/Ablst) |

## 功能

- 导入 XLSX、CSV、TSV、JSON、TXT，或用自然语言录入数据。
- MiMo Agent 执行单值或多值筛选、日期汇总、统计及图表切换，展示实际工具执行过程。
- 支持柱状图、折线图、占比图，原始明细与图表筛选同步，保留完整原始数据。
- 语音识别结果先填回输入框，用户核对后发送。
- 按账号隔离保存分析记录、对话、图表和已生成 PDF；支持删除与撤销。
- 报告主体分析整份数据，另设一至两页问题专题；支持 PDF 预览、缩放、翻页、下载和筛选明细 CSV 导出。

图表和统计由程序计算，AI 负责理解指令、调用工具和组织解读。报告校验不通过时会修订；仍失败则显示错误，用户也可主动选择程序统计报告，不将它标记为 AI 深度解读。

## 技术架构

| 层次 | 技术与职责 |
| --- | --- |
| 前端 | React、Vite、Recharts、Lucide、react-markdown |
| 数据 | 共享 JavaScript 计算模块、Papa Parse、read-excel-file |
| 后端 | Node.js、Express，提供认证、记录、Agent、语音和报告接口 |
| AI | 小米 MiMo、Vercel AI SDK、Zod 校验 |
| 报告 | PDFKit 生成，PDF.js 预览；附带 Noto CJK 字体及 OFL 许可 |
| 存储 | 服务端 JSON 文件，随机盐与 scrypt 密码哈希，HttpOnly 会话 Cookie |
| 测试 | Node.js 测试运行器、模拟供应商接口、临时账号目录 |

浏览器请求本站后端，由后端调用 MiMo；密钥不注入前端构建。详见 [架构说明](docs/architecture.md)。

## 安装与运行

需要 **Node.js 22.12 或以上版本**及 npm。调用 AI 时需要能访问 MiMo API。

```bash
git clone https://github.com/Ablst/Seet.git
cd Seet
npm ci
npm run build
npm start
```

打开 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)，首次使用注册自己的账号后登录。

Windows 也可双击 **启动见数.cmd**，自动安装缺少的依赖、构建并启动服务。保持终端窗口开启。不要直接双击 `index.html`，它是源码入口，需要构建和 HTTP 服务。

### 评审配置

应项目所有者的明确要求，本次提交包含 `.env` 中的**比赛专用 MiMo 密钥**，用于评审运行。该配置在 Public 仓库中可读取；运行时由后端加载，不打包进浏览器脚本。评审结束后由维护者撤销或更换此密钥。

另提供不含实际凭据的 [`.env.example`](.env.example)。使用自己的配置时，复制模板为 `.env` 并填写密钥。**不要用空模板覆盖已有 `.env`，否则比赛专用配置会被替换。**

```dotenv
AI_API_KEY=填写自己的MiMo密钥
AI_BASE_URL=https://api.xiaomimimo.com/v1
AI_MODEL=mimo-v2.6-flash
PORT=4173
```

完整变量、可选设置和数据目录见 [环境配置](docs/configuration.md)。AI 是否可用取决于密钥有效性、额度与网络。

## 开发与检查

```bash
# 终端一：后端（首次先执行 npm run build）
npm start
# 终端二：前端开发服务，/api 自动代理到 4173
npm run dev
# 自动测试和生产构建
npm test
npm run build
```

测试使用模拟 AI 响应和临时数据目录，不消耗真实模型额度；随附 XLSX 在测试中读取，不依赖开发者电脑路径。

## 评审体验

1. 启动服务，注册并登录。
2. 上传自己的表格、使用 `samples/` 模拟文件，或直接输入带数字的自然语言。
3. 提出筛选、对比、日期汇总或图表切换需求，展开执行过程核对结果。
4. 查看图表及筛选明细，或导出 CSV。
5. 生成报告，查看整体分析与问题专题，再预览、翻页、导出 PDF。
6. 从“分析记录”重新打开分析，检查对话、视图及报告恢复。

## 目录

```text
src/                 前端页面、组件、共享计算与样式
server/              Express、认证、记录、Agent 和语音接口
server/report/       报告范围、证据、AI 撰写、PDF 和保存校验
scripts/             Windows 启动辅助脚本
tests/               数据、认证、隔离、工具和报告回归测试
samples/             可公开的模拟 CSV、XLSX、文字数据
assets/fonts/        中文字体及许可证
public/              网站图标
docs/                架构、配置、开发历史与开源参考
.env                 所有者授权公开的比赛专用配置
.env.example         不含凭据的变量模板
package-lock.json    依赖锁文件
启动见数.cmd         Windows 启动入口
```

## 数据与运行边界

- 文件上限为 20 MB、50000 行、32 个指标、24 个分类字段。XLSX 读取首张工作表，公式结果和百分比格式需核对。
- 账号与记录首次运行时写入 `.data/`，该目录不提交，不含开发者已有账号、密码哈希或分析记录。
- 数据保存在运行服务的磁盘；迁移时备份 `.data/`。服务重启后需要重新登录。
- 不提交依赖目录、构建产物、临时文件、导出报告、截图和内部调试资料。克隆后通过 `npm ci` 与 `npm run build` 重建。
- 仓库包含后端源码，GitHub Pages 本身不能运行 Node.js。评审可按本 README 本地运行完整作品。

## Git 历史与参考

首次整理入库前已有本地开发文件，但没有 Git 提交，无法追溯成过去的提交。仓库从首次实际入库开始保留真实时间与后续改动，不倒填日期、不虚构历史。见 [开发历史说明](docs/development-history.md)。

第三方架构参考与采用范围见 [开源参考](docs/open-source-references.md)。字体许可位于 `assets/fonts/LICENSE.txt`，npm 依赖遵循各自许可证。
