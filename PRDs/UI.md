后端已经跑在 http://localhost:8000 了。现在请在当前目录下（或新建 frontend 目录）创建一个 Vite + React + TypeScript 项目，来构建“电商用户流失预测 AI Dashboard”。

# 技术栈与 UI 规范
1. 核心：Vite + React + TS + Tailwind CSS
2. 组件库：严格使用 shadcn/ui，请自动通过 npx 命令安装 `card`, `button`, `badge`, `scroll-area`, `toast` (包含 toaster) 组件。
3. 图表与图标：使用 `recharts` 渲染图表，使用 `lucide-react` 渲染图标。
4. 视觉风格：浅色模式（Light Mode）。全局背景 `bg-slate-50`，卡片 `bg-white` + `shadow-sm` + `rounded-xl`，边框 `border-slate-100`。风格需要清新、清晰、有高级的 SaaS 控制台质感。

# 页面布局与业务逻辑 (100vh 满屏布局)
请通过 fetch 调用本地后端的 API 完成数据渲染和交互。页面分为三大区块：

## 1. 顶部区块 (高度 15%)
调用 `/api/overview`。横向渲染 4 个统计卡片（包含数字和相关的 Lucide 图标，以及红绿趋势标识）。

## 2. 左侧队列 (宽度 25%，内部滚动)
调用 `/api/users`。使用 `ScrollArea` 组件渲染用户列表卡片。
- 卡片包含：头像、昵称、流失概率(红色高亮数字)、LTV标签(`Badge`组件，高净值为琥珀色，低净值为灰色)。
- 交互：默认选中第一个用户，高亮显示当前选中项（如 `bg-blue-50` 并带有左侧蓝色指示条）。

## 3. 右侧主体 (宽度 75%)
分为上下两部分。根据左侧选中的 user_id 调用 `/api/users/{user_id}/diagnosis` 动态渲染。
- **上半部 (AI 诊断室)**：
  - 左卡片：展示基础信息列表，并在核心位置用极其醒目的大数字或环形图展示其“流失概率”。
  - 右卡片：使用 Recharts 的 `BarChart` (水平模式) 渲染接口返回的 `shap_data`。增加流失概率的因素用红色向右显示，降低概率的用绿色向左显示。
- **下半部 (AI 智能行动建议)**：
  - 渲染接口返回的 `ai_suggestion` 文案。
  - 渲染对应的操作按钮组（主操作使用高亮 `Button`，次操作使用 `variant="outline"`）。
  - **核心闭环交互**：点击操作按钮后，调用 `POST /api/users/{user_id}/action` 接口。收到成功响应后，弹出 Toast 提示（"干预策略已成功下发"），将左侧列表中该用户的状态置为“已处理”（加上绿色Badge，降低透明度），并自动将其移至左侧列表的最底部（沉底），然后自动选中列表中的下一个未处理用户。