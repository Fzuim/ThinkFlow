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

![治愈简笔画：AI助记琐事](README.assets/治愈简笔画：AI助记琐事.png)

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
| **目标计划** | `/goals` | AI 将长期目标拆成阶段和执行任务；路线图、时间计划、加权进度、目标专属对话与复盘 |
| **每日简报** | `/briefing` | AI 根据当前任务状态自动生成今日概览，并单列目标计划进度与风险分析 |
| **专注模式** | `/focus` | 番茄钟 + Gacha 抽卡激励 + 免打扰环境 |
| **灵感寓言** | `/fable` | 输入任意概念，AI 为你写成寓言故事——激发创意联想 |
| **AI 记忆** | `/memory` | 自动提取工作上下文形成记忆库，支持语义搜索；LLM 基于记忆提供个性化建议 |
| **设置** | `/settings` | 多 LLM 供应商配置（Anthropic / OpenAI / DeepSeek / Ollama） |

---

## 目标计划模式

目标计划用于管理备考、学习路线、年度成长等需要持续数周或数月的长期事项。它与普通任务看板分开展示：普通任务留在任务看板，目标下的阶段和子任务只在目标路线图中出现，AI 助手仍是两类任务的统一操作入口。

### 使用流程

1. 在“目标计划”中手动创建目标，填写目标描述、成功标准和目标日期；也可以点击“让 AI 帮我规划”，通过对话生成完整目标。
2. AI 根据目标拆分阶段/里程碑和执行任务，为节点安排计划完成日期。涉及实际创建时，仍通过确认按钮由用户决定是否执行。
3. 进入目标详情后，在按计划日期正序排列的路线图中查看层级结构；支持新增节点、双击编辑名称/类型/日期、勾选完成和右键删除。
4. 目标进度根据叶子任务权重自动计算。卡片以“未开始 / 进行中 / 已完成”区分 0%、1–99% 和 100% 三种状态。
5. 点击“和 AI 讨论”进入目标专属对话。AI 只读取和操作当前目标内的阶段、任务与进度，对话记录也按目标独立保存，可用于继续拆解、调整计划、记录成果和复盘风险。

### 数据与展示边界

- **任务看板**：只展示普通任务，不混入目标计划的子任务。
- **目标路线图**：集中展示当前目标的阶段、里程碑和执行任务。
- **AI 助手**：新目标规划模式可以创建目标及其层级任务；目标专属模式会限制操作范围，避免误改其他目标或普通任务。
- **每日简报**：除普通任务概览外，使用独立的“目标计划分析”章节汇总目标进度、期限风险、计划偏差和下一步行动。

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
goal_id, parent_id, kind (task/milestone), planned_end_at, weight, sort_order, schedule_level
created_at, updated_at, completed_at
```

**Goal（目标计划）**

```
id, title, description, success_criteria
start_date, target_date, status
progress_mode, review_cycle
created_at, updated_at
```

**Memory（AI 记忆）**：类型 + 内容 + 重要度 + 访问计数

---

## LLM 架构

所有 LLM 调用通过 `LlmProvider` trait 统一抽象。支持流式 SSE（打字机效果），适用于 AI 助手对话场景。

### AI 助手数据流

```
用户输入 → chatStore.sendMessage()
  → invoke("task_assistant_stream")
  → Rust 构建 prompt（goals + tasks + memories + history）
  → provider.chat_stream() → SSE token 解析
  → 逐字 emit chunk 事件 → 前端打字机效果
  → emit done 事件 → executeAction 逐条执行
```

### 确认交互

AI 不确定的操作会返回 `suggested_actions`，前端渲染 [是] [否] 按钮，用户确认后再执行——避免 LLM 自作主张。

目标规划在同一动作协议上扩展了目标和层级关系：创建目标后，后续阶段/任务通过占位引用绑定到真实目标 ID；目标专属对话还会在前后端同时校验 `goal_id`，限制动作只能作用于当前目标。

---

## 项目结构

```
ThinkFlow/
├── thinkflow/
│   ├── src/                    # React 前端
│   │   ├── components/         # 页面组件
│   │   │   ├── tasks/          # 任务看板
│   │   │   ├── capture/        # AI 助手
│   │   │   ├── goals/          # 目标计划列表 + 路线图
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
