import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.database import get_conn, init_db

OVERVIEW_STATIC = {
    "trend": "+5%",
    "accuracy_rate": 0.925,
    "retention_rate": 0.185,
}


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Churn Dashboard API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/overview")
def get_overview():
    conn = get_conn()
    try:
        row = conn.execute(
            """
            SELECT
              SUM(CASE WHEN churn_probability > 0.6 AND processed = 0 THEN 1 ELSE 0 END) AS risk_open,
              SUM(CASE WHEN churn_probability > 0.6 AND processed = 0 THEN potential_loss ELSE 0 END) AS gmv_at_risk
            FROM users
            """
        ).fetchone()
        risk_users_today = int(row["risk_open"] or 0)
        threatened_gmv = int(round(row["gmv_at_risk"] or 0))
        return {
            "risk_users_today": risk_users_today,
            "trend": OVERVIEW_STATIC["trend"],
            "threatened_gmv": threatened_gmv,
            "accuracy_rate": OVERVIEW_STATIC["accuracy_rate"],
            "retention_rate": OVERVIEW_STATIC["retention_rate"],
            "retention_holdout_uplift_pp": 5.2,
        }
    finally:
        conn.close()


@app.get("/api/users")
def list_users():
    conn = get_conn()
    try:
        rows = conn.execute(
            """
            SELECT user_id, nickname, avatar_url, churn_probability, ltv_tier, potential_loss,
                   processed, main_category, lifecycle_status, open_ticket, risk_level
            FROM users
            ORDER BY processed ASC, potential_loss DESC
            """
        ).fetchall()
        return [
            {
                "user_id": r["user_id"],
                "nickname": r["nickname"],
                "avatar_url": r["avatar_url"],
                "churn_probability": r["churn_probability"],
                "ltv_tier": r["ltv_tier"],
                "potential_loss": r["potential_loss"],
                "processed": bool(r["processed"]),
                "main_category": r["main_category"],
                "lifecycle_status": r["lifecycle_status"],
                "open_ticket": bool(r["open_ticket"]),
                "risk_level": r["risk_level"],
            }
            for r in rows
        ]
    finally:
        conn.close()


@app.get("/api/users/{user_id}/diagnosis")
def get_diagnosis(user_id: str):
    conn = get_conn()
    try:
        u = conn.execute(
            """
            SELECT user_id, churn_probability, main_category, lifecycle_status, open_ticket, risk_level
            FROM users WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        d = conn.execute(
            """
            SELECT profile_json, shap_json, ai_suggestion, actions_json,
                   intervention_cost, expected_recover_gmv, roi_multiple
            FROM user_diagnosis WHERE user_id = ?
            """,
            (user_id,),
        ).fetchone()
        if not d:
            raise HTTPException(status_code=404, detail="Diagnosis not found")
        return {
            "user_id": u["user_id"],
            "churn_probability": u["churn_probability"],
            "main_category": u["main_category"],
            "lifecycle_status": u["lifecycle_status"],
            "open_ticket": bool(u["open_ticket"]),
            "risk_level": u["risk_level"],
            "profile": json.loads(d["profile_json"]),
            "shap_data": json.loads(d["shap_json"]),
            "ai_suggestion": d["ai_suggestion"],
            "actions": json.loads(d["actions_json"]),
            "economics": {
                "intervention_cost": float(d["intervention_cost"]),
                "expected_recover_gmv": float(d["expected_recover_gmv"]),
                "roi_multiple": float(d["roi_multiple"]),
            },
        }
    finally:
        conn.close()


class ActionBody(BaseModel):
    action_id: str


SENIOR_CS_ACTION_ID = "senior_cs_call"


@app.post("/api/users/{user_id}/action")
def post_action(user_id: str, body: ActionBody):
    conn = get_conn()
    try:
        u = conn.execute(
            "SELECT user_id, open_ticket FROM users WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        if not u:
            raise HTTPException(status_code=404, detail="User not found")
        if u["open_ticket"] and body.action_id != SENIOR_CS_ACTION_ID:
            raise HTTPException(
                status_code=400,
                detail="存在未结案售后工单：仅允许「转交高级客服电话安抚」",
            )
        conn.execute(
            "UPDATE users SET processed = 1 WHERE user_id = ?",
            (user_id,),
        )
        conn.execute(
            "INSERT INTO interventions (user_id, action_id) VALUES (?, ?)",
            (user_id, body.action_id),
        )
        conn.commit()
        return {"ok": True, "message": "干预策略已成功下发"}
    finally:
        conn.close()
