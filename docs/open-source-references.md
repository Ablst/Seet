# 开源案例与本作品的实现选择

核对日期：2026-10-27。参考官方项目仓库与项目文档，仅借鉴架构模式，没有复制项目代码。

| 项目 | 查看的能力 | 在见数中的应用 |
| --- | --- | --- |
| [Dify](https://github.com/langgenius/dify) | Agent、工作流、模型及工具组合 | 模型规划结构化操作，应用程序校验并执行；数据提取和图表操作分别处理 |
| [LangGraph](https://github.com/langchain-ai/langgraph) | 有状态 Agent 编排 | 每个分析保存自己的对话、数据和图表状态；最近对话及待确认数据一起交给模型 |
| [LibreChat](https://github.com/LibreChat-AI/LibreChat) | 多用户认证、对话保存、会话列表 | 先登录、按会话账号保存记录、从历史恢复，并在后端做所有权隔离 |

第二轮修订正式安装了 `ai` 与 `@ai-sdk/openai-compatible`，使用 Vercel AI SDK 的 `generateText`、`tool`、`isStepCount` 执行 MiMo 原生 Function Calling。官方来源：[AI SDK 工具循环](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)、[兼容供应商](https://ai-sdk.dev/providers/openai-compatible-providers)、[MiMo 官方接口](https://mimo.mi.com/docs/api/text-generation/openai-api)。工具在服务端串行执行，结果回传模型，最多六轮；通过 NDJSON 将真实工具状态传给前端，可取消任务。

另外核对 [assistant-ui](https://github.com/assistant-ui/assistant-ui) 的 Thread / Composer / 工具状态界面模式。前端沿用现有 React 状态与账号历史，实现同一容器内的固定输入栏和可滚动消息；没有安装 assistant-ui、Dify、LangGraph 或 LibreChat 整个平台。Markdown 消息采用 react-markdown，默认不执行原始 HTML。

当前工具包括 inspect_data、configure_view、calculate_statistics、check_data_quality、create_dataset，使用 Zod 校验参数。configure_view 实际计算筛选、日期粒度、分组与汇总，并检查饼图可用性后才更新视图。前端使用同一共享计算模块绘图。没有任意代码执行入口；模型上下文为字段概况、少量样本和工具结果，原始大表不直接发给模型。旧 /api/chat 保留兼容测试，工作台发送到 /api/agent。

记录保存在作品服务端 `.data/analyses/`。每个账号使用独立哈希文件，接口以登录 Cookie 决定所有者，不能通过客户端传账号读取其他人的记录。浏览器仅保存上次打开的记录编号偏好，不在 localStorage 保存密码、密钥或分析内容。
