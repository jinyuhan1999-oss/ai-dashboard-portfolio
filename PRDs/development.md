# 技术实现文档 (Technical Architecture)

## 一、 架构概述
本项目采用**全本地化 (Local-first) 前后端分离架构**。无需部署云端服务器和外部数据库，保障数据隐私，支持断网环境下的完美本地演示。

## 二、 技术栈选型
### 1. 前端 (Frontend)
* **核心框架**：Vite + React (TypeScript) - 提供极致的本地启动速度和流畅的 SPA 体验。
* **CSS 框架**：Tailwind CSS - 实用优先的原子化 CSS 框架。
* **UI 组件库**：shadcn/ui - 采用无头组件(Headless UI)理念，直接集成高品质源码，深度契合高级 SaaS 设计规范。
* **图表库**：Recharts - React 生态最稳定的声明式数据可视化库。
* **图标库**：Lucide-React。

### 2. 后端与数据库 (Backend & Database)
* **核心框架**：FastAPI (Python) - 轻量、高性能，自动生成 Swagger API 文档，便于前后端联调。
* **Web 服务器**：Uvicorn。
* **数据库**：SQLite - 轻量级本地文件数据库，零配置，免安装。使用 Python 内置的 `sqlite3` 库操作即可。

## 三、 API 接口契约 (RESTful API)
*(注：所有接口均需配置 CORS，允许前端 localhost 跨域请求)*

### 1. 获取业务概览数据
* **Endpoint**: `GET /api/overview`
* **Response**:
  ```json
  {
    "risk_users_today": 1245,
    "trend": "+5%",
    "threatened_gmv": 350000,
    "accuracy_rate": 0.925,
    "retention_rate": 0.185
  }
  ```

### 2. CORS
* **允许来源**：至少包含前端开发地址 `http://localhost:5173`（Vite 默认端口）；本地演示可按需增加其他 `http://localhost:*`）。
* **方法**：`GET`, `POST`, `OPTIONS`
* **请求头**：`Content-Type` 等常用安全头。

### 3. 获取待办用户队列
* **Endpoint**: `GET /api/users`
* **说明**：返回流失高风险用户列表。**排序**：未处理 (`processed: false`) 在前，按 `potential_loss` **降序**；已处理 (`processed: true`) 统一排在列表底部（仍可按 `potential_loss` 降序或保持稳定顺序）。与 [UI.md](UI.md) 左侧队列一致。
* **Response**:
  ```json
  [
    {
      "user_id": "u_10001",
      "nickname": "示例用户",
      "avatar_url": "https://api.dicebear.com/7.x/avataaars/svg?seed=u_10001",
      "churn_probability": 0.72,
      "ltv_tier": "high",
      "potential_loss": 12800.5,
      "processed": false
    }
  ]
  ```
* **字段**：`ltv_tier` 取 `"high"` | `"low"`（高净值 / 低净值）。

### 4. 获取单用户 AI 诊断与行动建议
* **Endpoint**: `GET /api/users/{user_id}/diagnosis`
* **Response**:
  ```json
  {
    "user_id": "u_10001",
    "churn_probability": 0.72,
    "profile": [
      { "label": "累计消费", "value": "¥12,400" },
      { "label": "近30天订单数", "value": "3" },
      { "label": "退换货次数", "value": "2" },
      { "label": "客诉记录", "value": "1 次（物流延迟）" }
    ],
    "shap_data": [
      { "feature": "近期物流延迟", "value": 0.18 },
      { "feature": "优惠券使用频次下降", "value": 0.12 },
      { "feature": "账户剩余积分", "value": -0.09 }
    ],
    "ai_suggestion": "该用户为高净值客户，近期物流体验恶化是主要推手。建议优先安排 VIP 专线回访并附专属致歉礼，避免直接大额补贴。",
    "actions": [
      { "id": "vip_escalation", "label": "生成 VIP 专线工单", "variant": "primary" },
      { "id": "apology_gift", "label": "发送专属致歉礼", "variant": "outline" },
      { "id": "coupon_light", "label": "下发轻量满减券", "variant": "outline" }
    ]
  }
  ```
* **说明**：`shap_data` 中 `value > 0` 表示**加剧流失风险**（前端水平条形图红色向右）；`value < 0` 表示**减缓流失风险**（绿色向左）。`actions` 供下方按钮渲染；`variant` 对应主按钮 / `outline` 次按钮。

### 5. 下发干预动作（闭环）
* **Endpoint**: `POST /api/users/{user_id}/action`
* **Request body**:
  ```json
  { "action_id": "vip_escalation" }
  ```
* **成功 Response**（示例）:
  ```json
  { "ok": true, "message": "干预策略已成功下发" }
  ```
* **语义**：服务端将该用户标记为已处理，并写入干预日志（可选表 `interventions`：user_id、action_id、时间）。前端在成功后 Toast、列表沉底与选中下一未处理用户，见 [UI.md](UI.md)。