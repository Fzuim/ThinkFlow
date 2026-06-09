# ThinkFlow 项目规范

## 技术栈

- **前端**: React 19 + TypeScript + Vite + Tailwind CSS 4
- **桌面框架**: Tauri 2 (Rust 后端)
- **UI 组件库**: animal-island-ui（动森风格）
- **国际化**: i18next（中文 / English）
- **状态管理**: Zustand

## UI 组件库：animal-island-ui

### 核心原则

**所有 UI 组件必须优先使用 animal-island-ui**，禁止引入其他 UI 组件库（如 shadcn/ui、antd、MUI 等）。
只有在 animal-island-ui 没有对应组件时，才用原生 HTML 元素 + Tailwind 自行实现。

### 引入方式

```tsx
import { Button, Card, Divider, Icon } from "animal-island-ui";
import "animal-island-ui/style"; // 在 main.tsx 中全局引入一次
```

### 可用组件

| 组件 | 用途 | 示例 |
|------|------|------|
| `Button` | 按钮（主要/虚线/文本/危险等） | `<Button type="primary">确定</Button>` |
| `Card` | 卡片容器 | `<Card>内容</Card>` |
| `Divider` | 分割线 | `<Divider />` |
| `Icon` | 动森图标 | `<Icon name="icon-chat" size={20} />` |
| `Input` | 输入框 | `<Input placeholder="..." />` |
| `Select` | 下拉选择 | `<Select options={...} />` |
| `Checkbox` | 复选框 | `<Checkbox checked={false}>标签</Checkbox>` |
| `Switch` | 开关 | `<Switch checked={false} />` |
| `Tabs` | 标签页 | `<Tabs items={[...]} />` |
| `Collapse` | 折叠面板 | `<Collapse items={[...]} />` |
| `Modal` | 模态框 | `<Modal visible={true}>...</Modal>` |
| `Loading` | 加载动画 | `<Loading />` |
| `CodeBlock` | 代码块 | `<CodeBlock code="..." />` |
| `Typewriter` | 打字机效果 | `<Typewriter text="..." />` |
| `Time` | 时间显示 | `<Time />` |
| `Phone` | 手机号输入 | `<Phone />` |
| `Footer` | 页脚 | `<Footer />` |
| `Cursor` | 动森光标（全局包裹） | `<Cursor><App /></Cursor>` |

### 可用图标

| 图标名 | 对应动森元素 | 适用场景 |
|--------|-------------|---------|
| `icon-chat` | Chat | 对话、AI 助手 |
| `icon-variant` | Variant | 变体、任务管理 |
| `icon-miles` | NookMiles | 专注模式、积分 |
| `icon-design` | Design | 设计、简报 |
| `icon-shopping` | Shopping | 购物、收藏 |
| `icon-camera` | Camera | 拍照、截图 |
| `icon-critterpedia` | Critterpedia | 图鉴、百科 |
| `icon-diy` | DIY | 手工、创建 |
| `icon-helicopter` | Helicopter | 出行、导航 |
| `icon-map` | Map | 地图、总览 |
| `icon-bounce` | Bounce | 弹跳动画效果 |

### Button type 可选值

- `primary` — 主要按钮（强调色）
- `dashed` — 虚线边框按钮
- `text` — 纯文本按钮
- `link` — 链接样式按钮
- `danger` — 危险操作按钮
- `ghost` — 幽灵按钮（透明背景）

### Cursor 光标组件

在 `main.tsx` 中用 `<Cursor>` 包裹整个应用根组件，全局启用动森风格鼠标光标：

```tsx
<Cursor>
  <App />
</Cursor>
```

光标尺寸在 `index.css` 中通过覆盖 `.animal-cursor` 样式控制。

## 主题色彩体系

动森暖色调主题，定义在 `src/index.css` 的 `@theme inline` 中：

| 用途 | CSS 变量 | 色值 |
|------|---------|------|
| 背景 | `--color-background` | `#f8f8f0` 暖白 |
| 前景文字 | `--color-foreground` | `#725d42` 暖棕 |
| 卡片 | `--color-card` | `rgb(247,243,223)` 奶油色 |
| 主强调 | `--color-primary` | `#19c8b9` 青绿 |
| 次要 | `--color-secondary` | `#f0e8d8` 浅棕 |
| 辅助文字 | `--color-muted-foreground` | `#9f927d` 灰棕 |
| 选中态 | `--color-accent` | `#B7C6E5` 浅蓝 |
| 危险 | `--color-destructive` | `#e05a5a` 红色 |
| 边框 | `--color-border` | `#c4b89e` 木色 |

新增页面时，文字颜色应使用这些语义化变量或直接使用对应色值，保持整体风格统一。

## 国际化

所有用户可见文本必须通过 i18next 管理，不要硬编码字符串：

```tsx
const { t } = useTranslation();
<p>{t("some.key")}</p>
```

翻译文件位于：
- `src/i18n/locales/zh.json` — 中文
- `src/i18n/locales/en.json` — 英文

## 项目结构

```
thinkflow/
├── src-tauri/           # Rust 后端
│   ├── src/
│   │   ├── agents/      # AI Agent（简报、优先级、提取等）
│   │   ├── commands/    # Tauri 命令（LLM、任务 CRUD）
│   │   ├── db/          # SQLite 数据层
│   │   ├── llm/         # LLM Provider 抽象层
│   │   └── models.rs    # 数据模型
│   └── icons/           # 应用图标（所有平台）
├── src/                 # React 前端
│   ├── components/
│   │   ├── layout/      # 主布局
│   │   ├── capture/     # AI 助手、快速录入
│   │   ├── tasks/       # 任务看板
│   │   ├── focus/       # 专注模式
│   │   ├── briefing/    # 每日简报
│   │   ├── memory/      # AI 记忆
│   │   ├── settings/    # 设置
│   │   └── shared/      # 通用组件
│   ├── stores/          # Zustand 状态管理
│   └── i18n/            # 国际化配置
└── public/cursors/      # 自定义光标图片
```
