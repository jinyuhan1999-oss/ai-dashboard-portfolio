import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "app.db"


def get_conn() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
                user_id TEXT PRIMARY KEY,
                nickname TEXT NOT NULL,
                avatar_url TEXT NOT NULL,
                churn_probability REAL NOT NULL,
                ltv_tier TEXT NOT NULL,
                potential_loss REAL NOT NULL,
                processed INTEGER NOT NULL DEFAULT 0,
                main_category TEXT NOT NULL DEFAULT '',
                lifecycle_status TEXT NOT NULL DEFAULT '',
                open_ticket INTEGER NOT NULL DEFAULT 0,
                risk_level TEXT NOT NULL DEFAULT '安全'
            );

            CREATE TABLE IF NOT EXISTS user_diagnosis (
                user_id TEXT PRIMARY KEY,
                profile_json TEXT NOT NULL,
                shap_json TEXT NOT NULL,
                ai_suggestion TEXT NOT NULL,
                actions_json TEXT NOT NULL,
                intervention_cost REAL NOT NULL DEFAULT 5,
                expected_recover_gmv REAL NOT NULL DEFAULT 120,
                roi_multiple REAL NOT NULL DEFAULT 24,
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );

            CREATE TABLE IF NOT EXISTS interventions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id TEXT NOT NULL,
                action_id TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY (user_id) REFERENCES users(user_id)
            );
            """
        )
        conn.commit()
        _migrate_db(conn)
        conn.commit()

        cur = conn.execute("SELECT COUNT(*) AS c FROM users")
        if cur.fetchone()["c"] == 0:
            _seed(conn)
            conn.commit()
        else:
            _backfill_new_columns(conn)
            conn.commit()
    finally:
        conn.close()


def _migrate_db(conn: sqlite3.Connection) -> None:
    cols = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    if "main_category" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN main_category TEXT NOT NULL DEFAULT ''")
    if "lifecycle_status" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN lifecycle_status TEXT NOT NULL DEFAULT ''")
    if "open_ticket" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN open_ticket INTEGER NOT NULL DEFAULT 0")
    if "risk_level" not in cols:
        conn.execute("ALTER TABLE users ADD COLUMN risk_level TEXT NOT NULL DEFAULT '安全'")

    dcols = {row["name"] for row in conn.execute("PRAGMA table_info(user_diagnosis)").fetchall()}
    if "intervention_cost" not in dcols:
        conn.execute(
            "ALTER TABLE user_diagnosis ADD COLUMN intervention_cost REAL NOT NULL DEFAULT 5"
        )
    if "expected_recover_gmv" not in dcols:
        conn.execute(
            "ALTER TABLE user_diagnosis ADD COLUMN expected_recover_gmv REAL NOT NULL DEFAULT 120"
        )
    if "roi_multiple" not in dcols:
        conn.execute("ALTER TABLE user_diagnosis ADD COLUMN roi_multiple REAL NOT NULL DEFAULT 24")


def _backfill_new_columns(conn: sqlite3.Connection) -> None:
    """已有库升级后写入演示差异数据。"""
    profile = [
        ("u_10001", "大家电", "流失高危期", 1, "安全"),
        ("u_10002", "3C数码", "正常低活期", 0, "安全"),
        ("u_10003", "快消品", "流失高危期", 0, "疑似羊毛党"),
        ("u_10004", "服饰鞋包", "流失高危期", 0, "安全"),
        ("u_10005", "快消品", "正常低活期", 0, "安全"),
        ("u_10006", "大家电", "流失高危期", 0, "安全"),
        ("u_10007", "家居日用", "正常低活期", 0, "安全"),
        ("u_10008", "3C数码", "流失高危期", 0, "安全"),
    ]
    economics = [
        ("u_10001", 80.0, 4200.0, 52.5),
        ("u_10002", 12.0, 380.0, 31.7),
        ("u_10003", 2.0, 15.0, 7.5),
        ("u_10004", 45.0, 2100.0, 46.7),
        ("u_10005", 3.5, 48.0, 13.7),
        ("u_10006", 65.0, 3100.0, 47.7),
        ("u_10007", 2.5, 28.0, 11.2),
        ("u_10008", 38.0, 1680.0, 44.2),
    ]
    for uid, cat, life, ticket, risk in profile:
        conn.execute(
            """
            UPDATE users SET main_category = ?, lifecycle_status = ?, open_ticket = ?, risk_level = ?
            WHERE user_id = ?
            """,
            (cat, life, ticket, risk, uid),
        )
    for uid, cost, gmv, roi in economics:
        conn.execute(
            """
            UPDATE user_diagnosis SET intervention_cost = ?, expected_recover_gmv = ?, roi_multiple = ?
            WHERE user_id = ?
            """,
            (cost, gmv, roi, uid),
        )


def _seed(conn: sqlite3.Connection) -> None:
    users_rows = []
    diag_rows = []

    seeds = [
        {
            "user_id": "u_10001",
            "nickname": "陈薇",
            "churn_probability": 0.82,
            "ltv_tier": "high",
            "potential_loss": 42800.0,
            "main_category": "大家电",
            "lifecycle_status": "流失高危期",
            "open_ticket": True,
            "risk_level": "安全",
            "intervention_cost": 80.0,
            "expected_recover_gmv": 4200.0,
            "roi_multiple": 52.5,
            "profile": [
                {"label": "注册时长", "value": "412 天"},
                {"label": "累计消费", "value": "¥186,200"},
                {"label": "退货次数", "value": "4 次"},
                {"label": "最近活跃", "value": "30 天内 · 2 单"},
            ],
            "shap_data": [
                {"feature": "近期物流延迟", "value": 0.22},
                {"feature": "退换货率上升", "value": 0.14},
                {"feature": "优惠券核销下滑", "value": 0.11},
                {"feature": "账户剩余积分", "value": -0.07},
            ],
            "ai_suggestion": "高净值用户；当前存在未结案售后工单，请先闭环服务再考虑补贴类策略。人工安抚优先级高于券促。",
            "actions": [
                {"id": "vip_escalation", "label": "生成 VIP 专线工单", "variant": "primary"},
                {"id": "apology_gift", "label": "发送专属致歉礼", "variant": "outline"},
                {"id": "coupon_light", "label": "下发轻量满减券", "variant": "outline"},
            ],
        },
        {
            "user_id": "u_10002",
            "nickname": "李楠",
            "churn_probability": 0.71,
            "ltv_tier": "high",
            "potential_loss": 31500.5,
            "main_category": "3C数码",
            "lifecycle_status": "正常低活期",
            "open_ticket": False,
            "risk_level": "安全",
            "intervention_cost": 12.0,
            "expected_recover_gmv": 380.0,
            "roi_multiple": 31.7,
            "profile": [
                {"label": "注册时长", "value": "286 天"},
                {"label": "累计消费", "value": "¥92,400"},
                {"label": "退货次数", "value": "1 次"},
                {"label": "最近活跃", "value": "30 天内 · 5 单"},
            ],
            "shap_data": [
                {"feature": "浏览未下单天数增加", "value": 0.16},
                {"feature": "购物车放弃率", "value": 0.13},
                {"feature": "会员等级权益感知弱", "value": 0.09},
                {"feature": "社群互动频次", "value": -0.05},
            ],
            "ai_suggestion": "活跃度尚可但转化走弱，可通过权益唤醒与限量专享刺激回访下单。",
            "actions": [
                {"id": "exclusive_drop", "label": "推送限量专享款", "variant": "primary"},
                {"id": "tier_reminder", "label": "强化等级权益说明", "variant": "outline"},
            ],
        },
        {
            "user_id": "u_10003",
            "nickname": "王琪",
            "churn_probability": 0.69,
            "ltv_tier": "low",
            "potential_loss": 4200.0,
            "main_category": "快消品",
            "lifecycle_status": "流失高危期",
            "open_ticket": False,
            "risk_level": "疑似羊毛党",
            "intervention_cost": 2.0,
            "expected_recover_gmv": 15.0,
            "roi_multiple": 7.5,
            "profile": [
                {"label": "注册时长", "value": "96 天"},
                {"label": "累计消费", "value": "¥8,950"},
                {"label": "退货次数", "value": "7 次"},
                {"label": "最近活跃", "value": "30 天内 · 1 单"},
            ],
            "shap_data": [
                {"feature": "促销敏感度下降", "value": 0.12},
                {"feature": "高频退货/核销异常", "value": 0.16},
                {"feature": "到货时效评分走低", "value": 0.10},
                {"feature": "签到积分留存", "value": -0.04},
            ],
            "ai_suggestion": "低净值用户；风控标注疑似羊毛党，营销补贴需谨慎，建议优先规则复核而非放量券促。",
            "actions": [
                {"id": "ship_coupon", "label": "下发满39减5免邮券", "variant": "primary"},
                {"id": "flash_tab", "label": "打开秒杀频道", "variant": "outline"},
            ],
        },
        {
            "user_id": "u_10004",
            "nickname": "赵越",
            "churn_probability": 0.78,
            "ltv_tier": "high",
            "potential_loss": 28900.0,
            "main_category": "服饰鞋包",
            "lifecycle_status": "流失高危期",
            "open_ticket": False,
            "risk_level": "安全",
            "intervention_cost": 45.0,
            "expected_recover_gmv": 2100.0,
            "roi_multiple": 46.7,
            "profile": [
                {"label": "注册时长", "value": "502 天"},
                {"label": "累计消费", "value": "¥124,800"},
                {"label": "退货次数", "value": "2 次"},
                {"label": "最近活跃", "value": "30 天内 · 0 单"},
            ],
            "shap_data": [
                {"feature": "客服首响时长", "value": 0.19},
                {"feature": "30 天无订单", "value": 0.17},
                {"feature": "客诉未闭环", "value": 0.08},
                {"feature": "历史好评率", "value": -0.06},
            ],
            "ai_suggestion": "服务体验是主因。建议升级服务通道并明确补偿方案，避免用户情绪继续发酵。",
            "actions": [
                {"id": "vip_escalation", "label": "升级客服工单", "variant": "primary"},
                {"id": "service_credit", "label": "发放服务补偿券", "variant": "outline"},
            ],
        },
        {
            "user_id": "u_10005",
            "nickname": "周洋",
            "churn_probability": 0.64,
            "ltv_tier": "low",
            "potential_loss": 3100.0,
            "main_category": "快消品",
            "lifecycle_status": "正常低活期",
            "open_ticket": False,
            "risk_level": "安全",
            "intervention_cost": 3.5,
            "expected_recover_gmv": 48.0,
            "roi_multiple": 13.7,
            "profile": [
                {"label": "注册时长", "value": "74 天"},
                {"label": "累计消费", "value": "¥6,200"},
                {"label": "退货次数", "value": "1 次"},
                {"label": "最近活跃", "value": "30 天内 · 2 单"},
            ],
            "shap_data": [
                {"feature": "同类平台比价行为", "value": 0.11},
                {"feature": "推送点击率下降", "value": 0.09},
                {"feature": "低价 SKU 占比偏好", "value": -0.03},
            ],
            "ai_suggestion": "价格敏感型，可用小额券包与凑单提醒拉回转化，控制补贴力度。",
            "actions": [
                {"id": "bundle_nudge", "label": "推送凑单提醒", "variant": "primary"},
                {"id": "coupon_light", "label": "下发轻量满减券", "variant": "outline"},
            ],
        },
        {
            "user_id": "u_10006",
            "nickname": "孙悦",
            "churn_probability": 0.73,
            "ltv_tier": "high",
            "potential_loss": 35600.0,
            "main_category": "大家电",
            "lifecycle_status": "流失高危期",
            "open_ticket": False,
            "risk_level": "安全",
            "intervention_cost": 65.0,
            "expected_recover_gmv": 3100.0,
            "roi_multiple": 47.7,
            "profile": [
                {"label": "注册时长", "value": "633 天"},
                {"label": "累计消费", "value": "¥201,000"},
                {"label": "退货次数", "value": "3 次"},
                {"label": "最近活跃", "value": "30 天内 · 3 单"},
            ],
            "shap_data": [
                {"feature": "履约破损率相关反馈", "value": 0.15},
                {"feature": "高客单订单延迟", "value": 0.14},
                {"feature": "Plus 权益使用率", "value": -0.08},
            ],
            "ai_suggestion": "履约问题是导火索，建议仓配升级沟通与额外安抚权益，巩固信任。",
            "actions": [
                {"id": "logistics_note", "label": "发送履约改进说明", "variant": "primary"},
                {"id": "apology_gift", "label": "寄送安抚礼盒", "variant": "outline"},
            ],
        },
        {
            "user_id": "u_10007",
            "nickname": "钱坤",
            "churn_probability": 0.67,
            "ltv_tier": "low",
            "potential_loss": 2800.0,
            "main_category": "家居日用",
            "lifecycle_status": "正常低活期",
            "open_ticket": False,
            "risk_level": "安全",
            "intervention_cost": 2.5,
            "expected_recover_gmv": 28.0,
            "roi_multiple": 11.2,
            "profile": [
                {"label": "注册时长", "value": "58 天"},
                {"label": "累计消费", "value": "¥5,480"},
                {"label": "退货次数", "value": "0 次"},
                {"label": "最近活跃", "value": "30 天内 · 1 单"},
            ],
            "shap_data": [
                {"feature": "登录频次下降", "value": 0.10},
                {"feature": "搜索词偏向竞品", "value": 0.08},
                {"feature": "小游戏/任务留存", "value": -0.04},
            ],
            "ai_suggestion": "召回成本低，可用互动任务+小额激励形成短期回访峰值。",
            "actions": [
                {"id": "task_bonus", "label": "开启回访任务奖励", "variant": "primary"},
                {"id": "coupon_light", "label": "下发轻量满减券", "variant": "outline"},
            ],
        },
        {
            "user_id": "u_10008",
            "nickname": "吴桐",
            "churn_probability": 0.76,
            "ltv_tier": "high",
            "potential_loss": 26800.0,
            "main_category": "3C数码",
            "lifecycle_status": "流失高危期",
            "open_ticket": False,
            "risk_level": "安全",
            "intervention_cost": 38.0,
            "expected_recover_gmv": 1680.0,
            "roi_multiple": 44.2,
            "profile": [
                {"label": "注册时长", "value": "441 天"},
                {"label": "累计消费", "value": "¥141,300"},
                {"label": "退货次数", "value": "0 次"},
                {"label": "最近活跃", "value": "30 天内 · 1 单"},
            ],
            "shap_data": [
                {"feature": "退款处理时长", "value": 0.18},
                {"feature": "支付失败重试放弃", "value": 0.10},
                {"feature": "订单准时达历史", "value": -0.05},
            ],
            "ai_suggestion": "支付与退款体验拖累留存，建议优先修复退款 SLA 感知并主动触达说明。",
            "actions": [
                {"id": "refund_sla", "label": "触发退款 SLA 加急", "variant": "primary"},
                {"id": "pay_retry_help", "label": "推送支付协助入口", "variant": "outline"},
            ],
        },
    ]

    for s in seeds:
        avatar_url = f"https://api.dicebear.com/7.x/avataaars/svg?seed={s['user_id']}"
        users_rows.append(
            (
                s["user_id"],
                s["nickname"],
                avatar_url,
                s["churn_probability"],
                s["ltv_tier"],
                s["potential_loss"],
                s["main_category"],
                s["lifecycle_status"],
                1 if s["open_ticket"] else 0,
                s["risk_level"],
                0,
            )
        )
        diag_rows.append(
            (
                s["user_id"],
                json.dumps(s["profile"], ensure_ascii=False),
                json.dumps(s["shap_data"], ensure_ascii=False),
                s["ai_suggestion"],
                json.dumps(s["actions"], ensure_ascii=False),
                s["intervention_cost"],
                s["expected_recover_gmv"],
                s["roi_multiple"],
            )
        )

    conn.executemany(
        """
        INSERT INTO users (
          user_id, nickname, avatar_url, churn_probability, ltv_tier, potential_loss,
          main_category, lifecycle_status, open_ticket, risk_level, processed
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        users_rows,
    )
    conn.executemany(
        """
        INSERT INTO user_diagnosis (
          user_id, profile_json, shap_json, ai_suggestion, actions_json,
          intervention_cost, expected_recover_gmv, roi_multiple
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        diag_rows,
    )
