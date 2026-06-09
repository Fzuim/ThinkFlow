# AGENT.md — AI Agent 团队协作规范

> 本文档是项目中所有 AI Coding Agent 的行为规范入口。
> 每个 Agent 在开始任务时都会读取并遵循本文件。
> 如果你是人类开发者，这也是一份告诉你「Agent 会怎么干活」的说明书。

---

## 一、Git 工作流

### 1.1 分支管理

- **所有 Agent 任务必须从最新的 `main` 切出新分支**，禁止在已有分支上叠加不相关的任务
- **禁止任何 Agent 直接 push 到 `main` 或 `master` 分支**
- 分支命名规范：`agent/<task-id>-<brief-description>`

```
# 正确示例
agent/PROJ-234-refresh-token-rotation
agent/PROJ-301-migrate-postgres-schema
agent/ISSUE-456-fix-login-redirect

# 错误示例
fix-bug          # 缺少 agent/ 前缀和 task-id
agent/my-work    # task-id 不可追溯
```

### 1.2 Worktree 隔离（多 Agent 并发场景）

当多个 Agent 并行工作时，每个 Agent 必须使用独立的 git worktree：

```bash
# 为每个 agent 任务创建独立 worktree
git worktree add ../agent-task-234 -b agent/PROJ-234-refresh-token
git worktree add ../agent-task-301 -b agent/PROJ-301-pg-migration

# 查看当前所有 worktree
git worktree list

# 任务完成后清理
git worktree remove ../agent-task-234
```

**规则：**
- 一个 Agent 一个 worktree，工作区不共享
- Agent 的文件操作必须限制在分配的 worktree 路径内
- 任务完成、PR 合并后，清理 worktree

---

## 二、Commit 规范

### 2.1 Commit Message 格式

每个 commit 必须遵循 Conventional Commits 格式，并包含 Agent 专属 trailer：

```
<type>(<scope>): <summary>

<正文：描述变更的背景与动机>

Agent-Task: <原始任务描述或任务ID>
Agent-Model: <使用的模型>
Agent-Decision: <关键设计决策及理由>
Agent-Limitation: <已知局限或后续TODO>
```

**示例：**

```
feat(auth): implement JWT refresh token rotation

Add sliding-window refresh token support to reduce re-login friction
while maintaining session security.

Agent-Task: PROJ-234 - Add refresh token support to auth service
Agent-Model: claude-opus-4-6
Agent-Decision: Used 7-day sliding window over fixed expiry for better UX;
refresh tokens stored in httpOnly cookie to prevent XSS access
Agent-Limitation: Redis TTL not yet aligned with token expiry on logout
```

**查询 Agent 提交历史：**

```bash
# 列出所有包含 Agent-Task trailer 的提交
git log --format='%(trailers:key=Agent-Task,valueonly)'

# 按 trailer 过滤
git log --grep="^Agent-Task:" --all
```

### 2.2 Atomic Commit 原则

**每个 commit 只表达一个可解释、可回滚、可验证的语义变化。**

- 一个 commit = 一个逻辑变更
- 每个 commit 节点上代码必须可编译、测试可通过
- **不要把重构和功能修改混在同一个 commit**
- **不要把多个不相关模块的修改混在同一个 commit**

```
# 好的切分：每个 commit 对应一个独立关注点
feat(auth): add RefreshToken domain model and repository interface
feat(auth): implement JWT refresh token issuance in AuthService
feat(auth): expose POST /auth/refresh endpoint
test(auth): add unit tests for refresh token rotation logic

# 反例：所有改动压成一个 commit
feat(auth): implement refresh token  # 3000行 diff，无法审查
```

### 2.3 Checkpoint Commit 策略

对于预计耗时超过 15 分钟的任务，在以下关键节点进行 checkpoint commit：

1. 完成数据模型/接口定义
2. 完成核心逻辑实现
3. 完成测试编写
4. 完成文档更新

Checkpoint commit 的 message 以 `[WIP]` 开头：

```
[WIP] feat(auth): draft refresh token domain model
```

**任务完成后、开 PR 前，使用 interactive rebase 整理历史：**

```bash
git log --oneline main..HEAD                    # 查看当前分支提交
git rebase -i main                               # 交互式整理
git log --oneline main..HEAD                    # 确认最终结果
```

整理策略：
- 将 `[WIP]` checkpoint commit squash 为有意义的语义 commit
- 确保最终历史中每个 commit 都能独立理解和回滚
- 每个保留的 commit 需要包含 Agent-Task、Agent-Decision trailer
- **不要对已经推送到远程的分支做 force push（除非已确认远程分支无他人使用）**

---

## 三、PR 流程

### 3.1 开 PR

- 所有 Agent 发起的 PR 必须使用项目规定的 Agent PR 模板（`.github/pull_request_template/agent.md`）
- 确保所有 CI 检查通过后再请求 review
- **Agent 不得自行 merge 自己的 PR**，merge 动作由人工触发

### 3.2 PR 模板必填项

```
## Task Description     — 原始任务描述
## What Changed         — 核心变更摘要
## Key Design Decisions — 关键设计决策及理由
## Alternatives Considered — 考虑过但未采用的方案
## Test Coverage        — 测试覆盖情况
## Known Limitations    — 已知局限和后续TODO
## Review Guidance      — 建议 reviewer 重点关注的部分
```

---

## 四、禁止提交的内容

以下内容**绝对禁止**出现在任何 commit 中：

- API keys、tokens、passwords（必须使用环境变量）
- 构建产物（`dist/`、`build/`、`.next/`）
- 依赖目录（`node_modules/`、`__pycache__/`、`.venv/`）
- 本地配置文件（`.env`、`.env.local`、`*.local`）
- 大二进制文件（>1MB，应使用 Git LFS）
- 临时调试代码、注释掉的测试用例

---

## 五、多 Agent 并发协作规则

### 5.1 隔离原则

- 每个 Agent 使用独立的 git worktree
- 每个 Agent 在独立的分支上工作
- 避免多个 Agent 同时修改同一个公共模块（如共享类型定义、配置文件）

### 5.2 冲突处理

- 如果 Agent 需要修改的公共模块已被其他 Agent 占用，先在分支上记录依赖，等前序 Agent 合并后再 rebase
- 合并前检查语义正确性，不能仅依赖 Git 的文本级无冲突合并
- 公共接口变更必须同步更新所有消费方

### 5.3 Monorepo 特别注意

- 只运行受当前变更影响的 package 的测试：

```bash
# Nx
nx affected --target=test

# Turborepo
turbo run test --filter='[HEAD^1]'
```

- Atomic commit 的边界：一个 commit 可以跨多个 package，只要修改在逻辑上不可分割
- 修改共享 library 的同时必须同步更新消费方

---

## 六、CI 命令速查

```bash
# 运行受影响的测试（推荐 Agent 本地使用）
nx affected --target=test
turbo run test --filter='[HEAD^1]'

# 全量检查（由 CI 在 PR 合并前执行，不推荐 Agent 本地运行）
# npm run test:all
```

---

## 七、可追溯性链路

```
任务系统（Jira/Linear/TAPD）
    ↓ task-id
Git Branch / PR
    ↓ Agent-Task trailer in commit message
Agent Session Log（可选，存储在 .agent-logs/ 目录，已加入 .gitignore）
    ↓ 完整的 prompt 和 agent reasoning
代码变更
```

---

## 八、快速自检清单

Agent 在提交代码前，必须自查以下项目：

- [ ] 分支名符合 `agent/<task-id>-<description>` 格式
- [ ] 没有直接 push 到 main/master
- [ ] commit message 符合 Conventional Commits 格式
- [ ] 每个 commit 包含 Agent-Task、Agent-Decision trailer
- [ ] 每个 commit 是 atomic 的（一个逻辑变更、可编译、可测试）
- [ ] 没有提交 API key、.env、node_modules 等敏感/生成文件
- [ ] PR description 已按模板完整填写
- [ ] CI 检查已通过
- [ ] 长任务 (>15min) 已做 checkpoint commit 并在最终 rebase 整理
- [ ] 未自行 merge 自己的 PR

---

## 九、项目概览 — ThinkFlow

> 以下内容是项目本身的框架信息，供 AI Agent 了解项目上下文。

### 9.1 项目简介

**ThinkFlow**（中文名：思行）是一款 AI 增强的个人任务管理与灵感工具桌面应用。通过集成 LLM（大语言模型），将任务管理、AI 对话、专注计时、灵感生成、记忆回溯等功能融合在一个统一的界面中。

- 技术栈：**Tauri v2**（Rust 后端 + React 前端）
- 前端框架：**React 19** + **TypeScript** + **Vite** + **Tailwind CSS v4**
- 后端语言：**Rust**（Tauri 命令 + SQLite 持久化）
- 状态管理：**Zustand**
- 路由：**react-router-dom v7**
- 国际化：**i18next**（中 / 英双语）
- UI 组件库：**animal-island-ui** + **lucide-react** 图标

### 9.2 项目结构

```
ThinkFlow/
├── AGENTS.md                  # AI Agent 协作规范 + 项目信息（本文件）
├── CLAUDE.md                  # Claude 专用配置
├── thinkflow/
│   ├── package.json           # Node 依赖与脚本
│   ├── src/                   # React 前端源码
│   │   ├── App.tsx            # 路由定义入口
│   │   ├── main.tsx           # React 挂载点
│   │   ├── components/
│   │   │   ├── tasks/         # 任务看板 (TaskBoard)
│   │   │   ├── capture/       # AI 助手 / 快速捕获 (TaskAssistant, QuickCapture)
│   │   │   ├── focus/         # 专注模式 (FocusView + 番茄钟 + Gacha 抽卡)
│   │   │   ├── briefing/      # 每日简报 (DailyBrief)
│   │   │   ├── fable/         # 灵感寓言 (FableView)
│   │   │   ├── memory/        # AI 记忆 (MemoryView)
│   │   │   ├── settings/      # 设置页面 (SettingsView)
│   │   │   ├── layout/        # 主布局 (MainLayout — 侧边导航栏)
│   │   │   └── shared/        # 通用组件 (TaskCard, TaskEditModal, Badges...)
│   │   ├── stores/            # Zustand 状态管理
│   │   │   ├── taskStore.ts   # 任务 CRUD + 过滤
│   │   │   ├── chatStore.ts   # AI 聊天会话 + 动作执行
│   │   │   ├── settingsStore.ts # LLM 配置
│   │   │   ├── focusStore.ts  # 专注模式状态
│   │   │   ├── briefingStore.ts
│   │   │   ├── memoryStore.ts
│   │   ├── i18n/              # 国际化 (en.json / zh.json)
│   │   └── hooks/             # 自定义 Hooks
│   └── src-tauri/             # Rust 后端源码
│       ├── Cargo.toml         # Rust 依赖
│       ├── src/
│       │   ├── main.rs        # Tauri 入口
│       │   ├── lib.rs         # 命令注册
│       │   ├── commands/      # Tauri 命令
│       │   │   ├── task.rs    # 任务 CRUD (create/update/delete/status)
│       │   │   ├── llm.rs     # LLM 调用 (extract/prioritize/brief/chat/fable/memory)
│       │   │   ├── memory.rs  # 记忆 CRUD
│       │   │   ├── settings.rs # 设置读写
│       │   │   └── hotkey.rs  # 全局快捷键
│       │   ├── agents/        # LLM Prompt 模板
│       │   │   ├── extraction.rs    # 任务提取
│       │   │   ├── prioritization.rs# 任务排序
│       │   │   ├── briefing.rs      # 每日简报
│       │   │   ├── task_assistant.rs# AI 助手对话
│       │   │   ├── fable.rs         # 灵感寓言
│       │   │   ├── memory_extraction.rs
│       │   │   └── memory_qa.rs
│       │   ├── db/            # 数据库层
│       │   │   ├── sqlite.rs  # SQLite CRUD (tasks/memories/projects/settings)
│       │   │   └── vector.rs  # 向量存储（预留）
│       │   ├── llm/           # LLM Provider 抽象
│       │   │   └── provider.rs # Anthropic / OpenAI / DeepSeek / 兼容接口
│       │   ├── models.rs      # 数据模型定义
│       │   └── tray.rs        # 系统托盘
│       └── tauri.conf.json    # Tauri 配置 (窗口 1200×800)
│
├── gen_cursor.py              # 图标生成工具
└── gen_icon.py                # 图标生成工具
```

### 9.3 功能模块与路由

| 路由 | 组件 | 功能 |
|---|---|---|
| `/` | `TaskBoard` | 任务看板（看板 + 拖拽排序 + 双击编辑弹窗） |
| `/capture` | `TaskAssistant` | AI 助手聊天（自然语言创建/移动/更新/删除任务） |
| `/focus` | `FocusView` | 专注模式（番茄钟 + Gacha 抽卡激励） |
| `/briefing` | `DailyBrief` | 每日简报（AI 生成今日任务概览） |
| `/fable` | `FableView` | 灵感寓言（输入概念 → AI 写成寓言故事） |
| `/memory` | `MemoryView` | AI 记忆（搜索/查看自动提取的上下文记忆） |
| `/settings` | `SettingsView` | 设置（LLM 供应商/模型/温度/Token/语言） |

### 9.4 LLM 供应商支持

- **Anthropic (Claude)** — 默认推荐
- **OpenAI (GPT)** — gpt-4o / gpt-4o-mini
- **DeepSeek**
- **OpenAI Compatible** — 兼容 Ollama / vLLM / 本地模型

所有 LLM 调用通过 `llm/provider.rs` 中的 `LlmProvider` trait 统一抽象。

### 9.5 数据模型

**Task**（核心实体）:
- `id: String` (UUID v4)
- `title`, `description`, `priority` (1-10), `status` (todo / in_progress / done / archived / cancelled)
- `urgency`, `importance`, `deadline`, `estimated_duration`
- `energy_level` (deep / medium / shallow), `category` (work / life / study / health)
- `tags`, `stakeholder`, `dependencies`
- 自动时间戳：`created_at`, `updated_at`, `completed_at`
- 状态机校验：`models.rs::is_valid_status_transition`

**Memory**（AI 记忆）: `type`, `content`, `importance`, 自动时间戳

### 9.6 关键设计模式

- **前端**：Zustand store 做 optimistic update → Tauri invoke 调用 Rust 命令 → 后端替换为服务端版本
- **AI 动作执行**：LLM 返回 JSON actions → 前端 `executeAction` 逐条执行 → 支持 `create`/`move`/`update`/`delete`
- **两步骤原子动作**：创建任务默认 `todo`，如需立即进行中则再发 `move` 动作（`__created__` 占位符）

### 9.7 启动命令

```bash
# 进入项目目录
cd thinkflow

# 安装依赖（首次）
npm install

# 启动 Tauri 桌面端（自动启动 Vite dev server + Rust 编译）
npm run tauri dev

# 仅启动前端开发服务器（浏览器预览）
npm run dev

# 生产构建
npm run build    # 前端构建
npm run tauri build  # 桌面端打包
```

> Tauri dev 模式下，前端文件变更通过 Vite HMR 热更新，Rust 文件变更通过 cargo watch 自动重编译。

---

## 九、AI 任务助手 — 技术架构

### 9.1 整体数据流（流式 + 打字机效果）

```
用户输入 → chatStore.sendMessage()
  ↓ 监听 chunk/done/error 事件
  ↓ invoke("task_assistant_stream", {message, history})

Rust 端:
  → 构建 prompt (tasks + memories + history)
  → provider.chat_stream() 接收 SSE token，**不发射事件到前端**
  → 完整 JSON 返回后解析出 reply + actions + suggested_actions
  → reply 逐字发射 → emit("task-assistant:chunk", { chunk: "某" })
  → 全部发完 → emit("task-assistant:done", { reply, actions, suggested_actions })

前端:
  → chunk 到达: streamingContent += chunk → UI 追加字符 + 闪烁光标
  → done 到达: 执行 actions, 生成最终 assistant 消息, streamingContent 清空
  → error 到达: 显示错误信息
```

### 9.2 事件协议

| 事件名 | 载荷 | 触发时机 |
|---|---|---|
| `task-assistant:chunk` | `{ chunk: string }` | 每收到一个 reply 文字字符 |
| `task-assistant:done` | `{ reply, actions, suggested_actions }` | 流式结束，完整 JSON 已解析 |
| `task-assistant:error` | `{ error: string }` | API key 未配置、网络错误等 |

### 9.3 提示词结构（`agents/task_assistant.rs`）

**三段式 system prompt：**

1. **头部**：当前日期时间 + 角色说明 + 任务列表 + 记忆上下文
2. **操作定义**：create / update / delete / move / query 五个操作类型的详细说明
3. **输出格式 + 确认规则**：JSON 模版 + "何时直接执行 vs 先询问建议"

**关键设计：**

- `actions`：AI 确认用户意图明确，立即执行的操作数组
- `suggested_actions`：AI 不确定用户是否要创建，前端弹"是/否"按钮确认
- `__created__` 魔术 ID：解决 LLM 无法预知 UUID 的问题，前端在 create 后原地替换
- `response_format: {"type": "json_object"}`：强制 LLM 输出合法 JSON
- 温度 0.3，最大 token 2048

### 9.4 确认交互流程

```
LLM JSON 输出:
  actions: []                         ← 空，不执行
  suggested_actions: [                ← 待用户确认
    { type: "create", task: { title: "参加周会", ... } }
  ]

前端:
  suggestedActions 有值 && suggestedConfirmed === null?
  → 是：渲染 [是] [否] 按钮
     → 用户点 [是]: confirmSuggested(id, true)  → 执行所有 suggested actions
     → 用户点 [否]: confirmSuggested(id, false) → 隐藏按钮，显示"已忽略"
  → 否：不渲染按钮
```

### 9.5 流式 SSE 实现

- **Provider trait**：`chat_stream()` 方法新增 `tx: UnboundedSender<String>` 参数
- **OpenAI / Compatible Provider**：发送请求时加 `"stream": true`，用 `resp.chunk().await` 逐块读取，按行解析 `data: {...}` SSE 格式，提取 `choices[0].delta.content`
- **不使用外部 crate**：用 reqwest 自带的 `chunk()` 方法，无需 `futures` 或 `tokio-stream`
- **Anthropic Provider**：未实现 streaming

### 9.6 关键代码文件

| 文件 | 职责 |
|---|---|
| `src-tauri/src/agents/task_assistant.rs` | system prompt 构建 |
| `src-tauri/src/commands/llm.rs` | `task_assistant_stream` Tauri 命令，发射事件 |
| `src-tauri/src/llm/provider.rs` | `LlmProvider` trait，含 `chat_stream` 方法 |
| `src-tauri/src/llm/openai.rs` | OpenAI 流式 SSE 解析实现 |
| `src-tauri/src/llm/compatible.rs` | 兼容 API 的流式实现 |
| `src/stores/chatStore.ts` | 前端状态管理，事件监听 + action 执行 |
| `src/components/capture/TaskAssistant.tsx` | 聊天 UI + 打字机光标 + 确认按钮 |

### 9.7 完整 system prompt（已翻译中文）

见下方 9.8 节。

### 9.8 历史对话处理

- 前端 `sendMessage()` 截取最后 10 条对话（仅 `role` + `content`）传给后端
- 后端 `build_prompt()` 按顺序拼在 system prompt 之后、当前用户消息之前
- 消息持久化：通过 Tauri `set_setting` 存到 SQLite，最后 100 条，重启自动加载
- 系统 prompt 每次都**完全重建**，包含数据库实时任务列表，防止 LLM 依赖记忆做出过时判断

### 9.9 原子性设计：create + move 两步操作

当用户说"现在同时在进行XXX"且任务不存在时：

1. LLM 输出两个 action：`create` + `move`（task_id = `__created__`）
2. 前端先执行 create → 拿到真实 UUID
3. 检测到 `move` 的 task_id 为 `__created__` → 替换为真实 UUID
4. 执行 move → 状态改为 in_progress

这样每个工具调用都是原子性的，避免 LLM 在单个 create 中判断是否设置 status 的逻辑错误。

