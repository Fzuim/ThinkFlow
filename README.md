# ThinkFlow · 思行

> AI 驱动的个人任务管理与灵感工具。告别日报周报的手工拼凑，让 LLM 理解你的工作上下文，自动规划、总结、回顾。

---

## 为什么做 ThinkFlow

市面上的待办工具（Todoist、TickTick、Things、Microsoft To Do……）功能趋同——增删改查、到期提醒、标签分类，二十年没变过。它们的核心假设是：**你知道该做什么，你只是需要一个地方记下来。**

但现实中，多数人的痛点是：

- 任务来源碎片化（聊天记录、邮件、会议纪要、突然冒出的想法）
- 优先级只能凭感觉排，缺乏客观评估
- 日报、周报靠手工回忆，耗时且遗漏严重
- 做事过程中缺乏深度专注的环境

![治愈简笔画：AI助记琐事](/Users/huangdq/code/llm/vibe-work/ThinkFlow_Github/README.assets/治愈简笔画：AI助记琐事.png)

**大语言模型（LLM）的出现，让任务管理有机会从"被动记录"变成"主动协作"。** ThinkFlow 的核心思路是：AI 不是替代你思考，而是帮你把思考的成本降到最低——

- 你用自然语言告诉它你要做什么，它帮你拆解、排优先级、追问遗漏
- 它根据你的工作节奏自动生成日报简报，而不是让你事后拼凑
- 专注模式下，它不打扰你，但你随时可以和它对话

**AI 赋能不是噱头，是牛马日报周报的最优解。**

---

## 功能模块

| 模块 | 路由 | 能力 |
|---|---|---|
| **AI 助手** | `/capture` | 自然语言对话创建/更新/删除/移动任务；LLM 自动提取行动项、追问确认、拆解子任务 |
| **任务看板** | `/` | 看板视图 + 拖拽排序 + 双击编辑；按状态/分类/优先级筛选 |
| **每日简报** | `/briefing` | AI 根据当前任务状态自动生成今日概览——适合直接贴进日报 |
| **专注模式** | `/focus` | 番茄钟 + Gacha 抽卡激励 + 免打扰环境 |
| **灵感寓言** | `/fable` | 输入任意概念，AI 为你写成寓言故事——激发创意联想 |
| **AI 记忆** | `/memory` | 自动提取工作上下文形成记忆库，支持语义搜索；LLM 基于记忆提供个性化建议 |
| **设置** | `/settings` | 多 LLM 供应商配置（Anthropic / OpenAI / DeepSeek / Ollama） |

---

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Tauri v2（Rust 后端 + Web 前端） |
| 前端 | React 19 + TypeScript + Vite + Tailwind CSS v4 |
| 状态管理 | Zustand |
| 路由 | react-router-dom v7 |
| 国际化 | i18next（中 / 英） |
| UI 组件 | animal-island-ui + lucide-react |
| 数据库 | SQLite（rusqlite + bundled） |
| LLM 抽象 | 统一 Provider trait，支持 Anthropic、OpenAI、DeepSeek、OpenAI Compatible |
| 桌面集成 | 系统托盘、全局快捷键、macOS 关闭到托盘 |

---

## 快速开始

### 环境要求

- Node.js >= 22
- Rust >= 1.77
- macOS / Windows / Linux

### 启动开发环境

```bash
# 进入项目目录
cd thinkflow

# 安装前端依赖
npm install

# 启动 Tauri 桌面端（自动启动 Vite dev server + Rust 编译）
npm run tauri dev
```

### 生产构建

```bash
npm run tauri build       # 构建当前平台的安装包
```

### CI / Release

```bash
git tag v0.1.0
git push origin v0.1.0   # 自动触发 macOS + Windows 构建 → draft release
```

---

## 数据模型

**Task（核心实体）**

```
id, title, description, priority (1-10), status (todo/in_progress/done/archived/cancelled)
urgency, importance, deadline, estimated_duration
energy_level (deep/medium/shallow), category (work/life/study/health)
tags, stakeholder, dependencies
created_at, updated_at, completed_at
```

**Memory（AI 记忆）**：类型 + 内容 + 重要度 + 访问计数

---

## LLM 架构

所有 LLM 调用通过 `LlmProvider` trait 统一抽象。支持流式 SSE（打字机效果），适用于 AI 助手对话场景。

### AI 助手数据流

```
用户输入 → chatStore.sendMessage()
  → invoke("task_assistant_stream")
  → Rust 构建 prompt（tasks + memories + history）
  → provider.chat_stream() → SSE token 解析
  → 逐字 emit chunk 事件 → 前端打字机效果
  → emit done 事件 → executeAction 逐条执行
```

### 确认交互

AI 不确定的操作会返回 `suggested_actions`，前端渲染 [是] [否] 按钮，用户确认后再执行——避免 LLM 自作主张。

---

## 项目结构

```
ThinkFlow/
├── thinkflow/
│   ├── src/                    # React 前端
│   │   ├── components/         # 页面组件
│   │   │   ├── tasks/          # 任务看板
│   │   │   ├── capture/        # AI 助手
│   │   │   ├── focus/          # 专注模式
│   │   │   ├── briefing/       # 每日简报
│   │   │   ├── fable/          # 灵感寓言
│   │   │   ├── memory/         # AI 记忆
│   │   │   ├── settings/       # 设置
│   │   │   ├── layout/         # 主布局
│   │   │   └── shared/         # 通用组件
│   │   ├── stores/             # Zustand 状态管理
│   │   ├── i18n/               # 国际化
│   │   └── hooks/              # 自定义 Hooks
│   └── src-tauri/              # Rust 后端
│       ├── src/
│       │   ├── commands/       # Tauri 命令 (task/llm/memory/settings)
│       │   ├── agents/         # LLM Prompt 模板
│       │   ├── db/             # SQLite + 向量存储
│       │   ├── llm/            # LLM Provider 抽象 + 流式 SSE
│       │   └── models.rs       # 数据模型
│       └── tauri.conf.json
├── .github/workflows/build.yml # CI/CD 自动构建
└── AGENTS.md                   # AI Agent 协作规范
```

---

## License

MIT
