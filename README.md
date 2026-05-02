# 电商用户流失预测 AI Dashboard（本地演示）

全本地化前后端分离工程：**FastAPI + SQLite** 提供 REST API，**Vite + React + TypeScript + Tailwind + shadcn 风格组件** 渲染看板。契约见 [PRDs/development.md](PRDs/development.md)，交互见 [PRDs/UI.md](PRDs/UI.md)。

## 环境要求

- Python 3.10+（已验证可使用 `pip`、`uvicorn`）
- Node.js 20+ 与 npm（用于前端依赖安装与 `vite dev`）

若仅验收后端，可只用浏览器或 `curl` / `Invoke-RestMethod` 访问 `http://127.0.0.1:8000/docs`。

## 启动后端

```powershell
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

- SQLite 文件：`backend/data/app.db`（首次启动自动建表并写入演示种子数据）。
- 清空重置演示库：停止进程后删除 `backend/data/app.db`，再次启动即可重新种子化。
- OpenAPI：`http://127.0.0.1:8000/docs`

## 启动前端

```powershell
cd frontend
npm install
npm run dev
```

默认打开 `http://localhost:5173`。开发模式下 Vite 将 **`/api` 代理到 `http://127.0.0.1:8000`**（见 [frontend/vite.config.ts](frontend/vite.config.ts)），避免浏览器跨域问题。

生产构建或自定义后端地址时，可设置环境变量 `VITE_API_URL`（例如 `http://127.0.0.1:8000`），此时请求将发往该基址而非同源代理。

## 闭环验收清单（对照 PRD / UI）

1. **顶部概览**：四个指标卡片展示今日高风险人数（含红/绿趋势）、受威胁 GMV、模型准确率、策略挽留成功率；数据来自 `GET /api/overview`。
2. **左侧队列**：`GET /api/users`，未处理在前且按 `potential_loss` 降序，已处理沉底；头像、昵称、红色流失概率、LTV Badge（高净值琥珀 / 低净值灰色）；选中项蓝底与左侧指示条。
3. **右侧诊断**：`GET /api/users/{id}/diagnosis`，画像列表 + 大号流失概率；SHAP 水平条形图正值红色、负值绿色。
4. **行动建议**：展示 `ai_suggestion` 与主次按钮；点击后 `POST /api/users/{id}/action`，成功 Toast「干预策略已成功下发」，用户标记已处理（绿 Badge + 降透明度），列表顺序更新后自动选中下一个未处理用户。
5. **隐私 / 本地**：无云端依赖；断网环境下仍可演示（前端静态资源 + 本机 API）。

## 仓库结构

- `backend/app/main.py` — FastAPI 路由、CORS、`/api/overview`、`/api/users`、`/api/users/{id}/diagnosis`、`POST .../action`
- `backend/app/database.py` — SQLite 初始化与种子数据、`interventions` 日志表
- `frontend/src/App.tsx` — 100vh 布局与业务交互
- `frontend/src/components/ui/*` — Button / Card / Badge / ScrollArea / Toast（对齐 UI 规范）
