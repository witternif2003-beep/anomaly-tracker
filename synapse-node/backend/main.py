"""FastAPI gateway: prompt dispatch, status control and SSE batch stream."""
import asyncio
import hmac
import json
import os
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.orm import Session

from database import MasterPrompt, SessionLocal, get_db, init_db, utcnow
from worker import process_master_prompt_continuous

app = FastAPI(title="SYNAPSE-NODE DASHBOARD API")
OPERATOR_TOKEN = os.getenv("OPERATOR_TOKEN", "")


@app.on_event("startup")
def _startup() -> None:
    init_db()


def require_operator(authorization: str = Header(default="")) -> None:
    if len(OPERATOR_TOKEN) < 16:
        raise HTTPException(503, "OPERATOR_TOKEN is not configured (min 16 chars)")
    if not hmac.compare_digest(authorization.removeprefix("Bearer ").strip(), OPERATOR_TOKEN):
        raise HTTPException(401, "operator token required")


class InitiateBody(BaseModel):
    prompt: str = Field(min_length=1, max_length=20_000)
    instruction: str = Field(default="", max_length=4_000)


class StatusBody(BaseModel):
    status: Literal["ACTIVE", "PAUSED", "COMPLETED"]


@app.get("/api/health")
def health(db: Session = Depends(get_db)):
    db.execute(text("SELECT 1"))
    return {"ok": True, "deepseek": "configured" if os.getenv("DEEPSEEK_API_KEY") else "missing DEEPSEEK_API_KEY"}


@app.post("/api/initiate-protocol", status_code=201, dependencies=[Depends(require_operator)])
def initiate_protocol(body: InitiateBody, db: Session = Depends(get_db)):
    master = MasterPrompt(prompt_text=body.prompt, instruction=body.instruction)
    db.add(master)
    db.commit()
    process_master_prompt_continuous.delay(str(master.id))
    return {"status": "PROTOCOL INITIATED", "prompt_id": str(master.id)}


@app.patch("/api/prompts/{prompt_id}", dependencies=[Depends(require_operator)])
def set_status(prompt_id: str, body: StatusBody, db: Session = Depends(get_db)):
    master = db.get(MasterPrompt, prompt_id)
    if not master:
        raise HTTPException(404, "prompt not found")
    was_active = master.status == "ACTIVE"
    master.status, master.updated_at = body.status, utcnow()
    db.commit()
    if body.status == "ACTIVE" and not was_active:
        process_master_prompt_continuous.delay(prompt_id)
    return {"ok": True, "id": prompt_id, "status": body.status}


BATCH_SQL = text(
    """SELECT b.seq, b.id, b.batch_number, b.status, b.target_codename, b.anomaly_score, b.error, b.model, b.processed_at, b.raw_output,
         (SELECT jsonb_object_agg(t.metric_key, t.metric_value) FROM synapse_system_telemetry t WHERE t.batch_id = b.id) AS telemetry
       FROM synapse_output_batches b
       WHERE b.master_prompt_id = :pid AND b.seq > :after ORDER BY b.seq LIMIT 100"""
)


@app.get("/api/stream-batches/{prompt_id}")
async def stream_batches(prompt_id: str, request: Request, after: int = 0, last_event_id: Optional[str] = Header(default=None)):
    last_seq = int(last_event_id) if last_event_id and last_event_id.isdigit() else after

    async def event_generator():
        nonlocal last_seq
        yield "retry: 1500\n\n"
        while not await request.is_disconnected():
            with SessionLocal() as db:
                rows = db.execute(BATCH_SQL, {"pid": prompt_id, "after": last_seq}).mappings().all()
            for r in rows:
                last_seq = r["seq"]
                payload = {
                    "seq": r["seq"], "id": str(r["id"]), "batch": r["batch_number"], "status": r["status"],
                    "codename": r["target_codename"], "score": float(r["anomaly_score"]) if r["anomaly_score"] is not None else None,
                    "error": r["error"], "model": r["model"], "processedAt": r["processed_at"].isoformat(),
                    "data": r["raw_output"], "telemetry": r["telemetry"] or {},
                }
                yield f"id: {r['seq']}\nevent: batch\ndata: {json.dumps(payload)}\n\n"
            yield ": ping\n\n"
            await asyncio.sleep(2)

    return StreamingResponse(event_generator(), media_type="text/event-stream", headers={"Cache-Control": "no-store"})
