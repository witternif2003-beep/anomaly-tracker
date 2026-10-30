"""Celery worker: one DeepSeek call per batch, re-queues itself while the prompt stays ACTIVE."""
import json
import os
import time

from celery import Celery
from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI
from sqlalchemy import func

from database import MasterPrompt, OutputBatch, SessionLocal, SystemTelemetry

celery_app = Celery("synapse_node", broker=os.getenv("REDIS_URL", "redis://localhost:6379/0"))
celery_app.conf.task_acks_late = True
celery_app.conf.worker_prefetch_multiplier = 1

MODEL = os.getenv("DEEPSEEK_MODEL", "deepseek-flash")
THINKING = "enabled" if os.getenv("DEEPSEEK_THINKING") == "enabled" else "disabled"
INTERVAL_SEC = int(os.getenv("BATCH_INTERVAL_SEC", "60"))
MAX_TOKENS = int(os.getenv("DEEPSEEK_MAX_TOKENS", "2048"))

SYSTEM_PROMPT = (
    "You are a batch processor for an operator-supplied master prompt. Each request is one batch. "
    "Reply with exactly one JSON object and nothing else. Required keys: \"codename\" (short label, max 60 chars), "
    "\"summary\" (1-3 sentences), \"anomaly_score\" (number 0-100, your own self-assessed score), \"metrics\" (object). "
    "Add any other keys the master prompt asks for. Do not present invented facts as verified.\n"
    "EXAMPLE JSON OUTPUT:\n{\"codename\":\"BATCH-ALPHA\",\"summary\":\"...\",\"anomaly_score\":12.5,\"metrics\":{\"items\":3}}"
)


def client() -> OpenAI:
    return OpenAI(
        api_key=os.environ["DEEPSEEK_API_KEY"],
        base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
        timeout=float(os.getenv("DEEPSEEK_TIMEOUT_SEC", "60")),
        max_retries=0,
    )


class BlankOutput(Exception):
    pass


def clamp_score(v):
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n or n in (float("inf"), float("-inf")):
        return None
    return round(max(-999.99, min(999.99, n)), 2)


@celery_app.task(bind=True, max_retries=3)
def process_master_prompt_continuous(self, prompt_id: str):
    db = SessionLocal()
    try:
        master = db.get(MasterPrompt, prompt_id)
        if not master or master.status != "ACTIVE":
            return "Halted: prompt inactive."
        next_no = (db.query(func.coalesce(func.max(OutputBatch.batch_number), 0)).filter(OutputBatch.master_prompt_id == master.id).scalar()) + 1
        recent = [
            r[0]
            for r in db.query(OutputBatch.target_codename)
            .filter(OutputBatch.master_prompt_id == master.id, OutputBatch.status == "OK")
            .order_by(OutputBatch.seq.desc())
            .limit(8)
        ]
        user = f"Master Prompt: {master.prompt_text}\nInstruction: {master.instruction or 'Produce the next batch.'}\nBatch number: {next_no}"
        if recent:
            user += f"\nCodenames already used (produce a new, different batch): {', '.join(recent)}"
        user += "\nReturn json."

        started = time.monotonic()
        resp = client().chat.completions.create(
            model=MODEL,
            messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
            response_format={"type": "json_object"},
            max_tokens=MAX_TOKENS,
            extra_body={"thinking": {"type": THINKING}},
        )
        latency_ms = int((time.monotonic() - started) * 1000)
        content = resp.choices[0].message.content or ""
        try:
            parsed = json.loads(content) if content.strip() else None
        except json.JSONDecodeError:
            parsed = None
        if not isinstance(parsed, dict):
            raise BlankOutput(f"model returned non-JSON content (finish_reason={resp.choices[0].finish_reason})")

        codename = str(parsed.get("codename") or parsed.get("title") or "UNLABELLED").strip()[:100]
        batch = OutputBatch(
            master_prompt_id=master.id, batch_number=next_no, status="OK", target_codename=codename,
            raw_output=parsed, anomaly_score=clamp_score(parsed.get("anomaly_score")), model=resp.model,
        )
        db.add(batch)
        db.flush()
        u = resp.usage
        extra = getattr(u, "model_extra", None) or {}
        metrics = {
            "M01_latency_ms": latency_ms,
            "M02_attempts": self.request.retries + 1,
            "M03_http_status": 200,
            "M04_prompt_tokens": getattr(u, "prompt_tokens", None),
            "M05_completion_tokens": getattr(u, "completion_tokens", None),
            "M06_total_tokens": getattr(u, "total_tokens", None),
            "M07_cache_hit_tokens": extra.get("prompt_cache_hit_tokens"),
            "M08_cache_miss_tokens": extra.get("prompt_cache_miss_tokens"),
            "M10_finish_reason": resp.choices[0].finish_reason,
            "M11_model_score": clamp_score(parsed.get("anomaly_score")),
            "M12_json_valid": "true",
            "M13_output_bytes": len(content.encode()),
            "M14_output_keys": len(parsed),
            "M15_model": resp.model,
            "M16_system_fingerprint": resp.system_fingerprint,
        }
        db.add_all(SystemTelemetry(batch_id=batch.id, metric_key=k, metric_value=str(v)[:255]) for k, v in metrics.items() if v is not None)
        db.commit()
        process_master_prompt_continuous.apply_async(args=[prompt_id], countdown=INTERVAL_SEC)
        return f"Batch {next_no} processed."
    except (APIConnectionError, APITimeoutError, BlankOutput) as exc:
        db.rollback()
        return _retry_or_record(self, db, prompt_id, exc, None)
    except APIStatusError as exc:
        db.rollback()
        if exc.status_code == 429 or exc.status_code >= 500:
            return _retry_or_record(self, db, prompt_id, exc, exc.status_code)
        _record_error(db, prompt_id, exc, exc.status_code, self.request.retries + 1)
        return f"Failed: HTTP {exc.status_code}"
    finally:
        db.close()


def _retry_or_record(task, db, prompt_id, exc, status):
    if task.request.retries < task.max_retries:
        raise task.retry(exc=exc, countdown=2 ** task.request.retries)
    _record_error(db, prompt_id, exc, status, task.request.retries + 1)
    process_master_prompt_continuous.apply_async(args=[prompt_id], countdown=INTERVAL_SEC)
    return "Failed after retries."


def _record_error(db, prompt_id, exc, status, attempts):
    next_no = (db.query(func.coalesce(func.max(OutputBatch.batch_number), 0)).filter(OutputBatch.master_prompt_id == prompt_id).scalar()) + 1
    batch = OutputBatch(master_prompt_id=prompt_id, batch_number=next_no, status="ERROR", error=str(exc)[:1000], model=MODEL)
    db.add(batch)
    db.flush()
    rows = {"M02_attempts": attempts, "M03_http_status": status, "M12_json_valid": "false", "M17_error": str(exc)}
    db.add_all(SystemTelemetry(batch_id=batch.id, metric_key=k, metric_value=str(v)[:255]) for k, v in rows.items() if v is not None)
    db.commit()
