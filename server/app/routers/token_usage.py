"""
Token Usage Router — /api/token-usage
Add to main.py: from app.routers.token_usage import router as token_router
                app.include_router(token_router)
"""
import os
import json
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, Depends
from typing import Optional

from app.auth.middleware import require_role
from app.database import db

router = APIRouter()

_TOKEN_LOG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "token_usage_log.json")

# One-time migration: an earlier version of this file used a path one level
# too shallow (server/app/token_usage_log.json instead of server/), so some
# real entries may be sitting in the wrong file. Merge them into the correct
# one on startup so they aren't silently lost now that the path is fixed.
def _migrate_misplaced_log():
    correct_path = os.path.abspath(_TOKEN_LOG_PATH)
    stale_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "token_usage_log.json"))
    if stale_path == correct_path or not os.path.exists(stale_path):
        return
    try:
        with open(stale_path, "r") as f:
            stale_entries = json.load(f)
        existing_entries = []
        if os.path.exists(correct_path):
            with open(correct_path, "r") as f:
                existing_entries = json.load(f)
        existing_ids = {e.get("id") for e in existing_entries}
        merged = existing_entries + [e for e in stale_entries if e.get("id") not in existing_ids]
        merged.sort(key=lambda e: e.get("timestamp", ""))
        # NOTE: this used to truncate to `merged[-500:]` here too — removed,
        # same reasoning as the writer-side fix in llm_service.py/playwright.py.
        # A migration is exactly the moment you most want to keep everything.
        with open(correct_path, "w") as f:
            json.dump(merged, f)
        os.remove(stale_path)
        print(f"[token_usage] Migrated {len(stale_entries)} entries from misplaced log file into {correct_path}")
    except Exception as e:
        print(f"[token_usage] Migration of misplaced log file failed: {e}")

_migrate_misplaced_log()

MODEL_PRICING = {
    "gemini-3-flash-preview": {"input": 0.075, "output": 0.30},
    "gemini-2.5-flash-preview": {"input": 0.075, "output": 0.30},
    "gemini-2.0-flash":         {"input": 0.075, "output": 0.30},
    "gemini-1.5-flash":         {"input": 0.075, "output": 0.30},
    "gemini-1.5-pro":           {"input": 1.25,  "output": 5.00},
}

def _calc_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    p = MODEL_PRICING.get(model, {"input": 0.075, "output": 0.30})
    return round((input_tokens / 1_000_000) * p["input"] + (output_tokens / 1_000_000) * p["output"], 6)

def _load_log() -> list:
    try:
        path = os.path.abspath(_TOKEN_LOG_PATH)
        if not os.path.exists(path):
            return []
        with open(path, "r") as f:
            return json.load(f)
    except Exception:
        return []


@router.get("/api/token-usage")
async def get_token_usage(app_id: Optional[str] = None, _=Depends(require_role("admin"))):
    entries = _load_log()

    # ── Live-app filter ────────────────────────────────────────────────
    # Entries can reference app_ids from apps that no longer exist (e.g. an
    # app was recreated during a schema/db reset and got a new id). Those
    # entries are real history but should never inflate "All Apps" totals
    # for apps that are gone. We resolve this by checking against the
    # Application table directly, rather than trusting every app_id in the
    # log file blindly.
    live_apps = await db.application.find_many()
    live_app_ids = {a.id for a in live_apps}

    if app_id:
        entries = [e for e in entries if e.get("app_id") == app_id]
    else:
        # "All Apps" view: only count entries whose app_id still exists.
        # Entries with a missing/None app_id, or an app_id that was deleted
        # or superseded, are excluded from aggregate totals but remain in
        # the log file untouched for audit purposes.
        entries = [e for e in entries if e.get("app_id") in live_app_ids]

    enriched = [{**e, "cost_usd": _calc_cost(e.get("model", "gemini-3-flash-preview"), e.get("input_tokens", 0), e.get("output_tokens", 0))} for e in entries]

    # Group by batch_label
    by_batch: dict = {}
    for e in enriched:
        label = e.get("batch_label") or "Unknown"
        if label not in by_batch:
            by_batch[label] = {"batch_label": label, "app_id": e.get("app_id"), "timestamp": e.get("timestamp"), "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "cost_usd": 0.0, "call_count": 0}
        by_batch[label]["input_tokens"]  += e.get("input_tokens", 0)
        by_batch[label]["output_tokens"] += e.get("output_tokens", 0)
        by_batch[label]["total_tokens"]  += e.get("total_tokens", 0)
        by_batch[label]["cost_usd"]       = round(by_batch[label]["cost_usd"] + e["cost_usd"], 6)
        by_batch[label]["call_count"]    += 1

    # ── Phase split: generation vs execution ─────────────────────────────
    GENERATION_TYPES = {"generation_pass1", "generation_pass2"}
    EXECUTION_TYPES  = {"self_healing", "execution_agent_step"}

    def _phase_totals(phase_entries):
        return {
            "input_tokens":  sum(e.get("input_tokens", 0) for e in phase_entries),
            "output_tokens": sum(e.get("output_tokens", 0) for e in phase_entries),
            "total_tokens":  sum(e.get("total_tokens", 0) for e in phase_entries),
            "cost_usd":      round(sum(e.get("cost_usd", 0) for e in phase_entries), 6),
            "call_count":    len(phase_entries),
        }

    def _phase_batches(phase_entries):
        pb: dict = {}
        for e in phase_entries:
            label = e.get("batch_label") or "Unknown"
            if label not in pb:
                pb[label] = {"batch_label": label, "timestamp": e.get("timestamp"), "input_tokens": 0, "output_tokens": 0, "total_tokens": 0, "cost_usd": 0.0, "call_count": 0}
            pb[label]["input_tokens"]  += e.get("input_tokens", 0)
            pb[label]["output_tokens"] += e.get("output_tokens", 0)
            pb[label]["total_tokens"]  += e.get("total_tokens", 0)
            pb[label]["cost_usd"]       = round(pb[label]["cost_usd"] + e.get("cost_usd", 0), 6)
            pb[label]["call_count"]    += 1
        return list(reversed(list(pb.values())))

    gen_entries  = [e for e in enriched if e.get("type") in GENERATION_TYPES]
    exec_entries = [e for e in enriched if e.get("type") in EXECUTION_TYPES]
    other_entries= [e for e in enriched if e.get("type") not in GENERATION_TYPES | EXECUTION_TYPES]

    return {
        "entries":  list(reversed(enriched)),
        "by_batch": list(reversed(list(by_batch.values()))),
        "totals": {
            "input_tokens":  sum(e.get("input_tokens", 0) for e in enriched),
            "output_tokens": sum(e.get("output_tokens", 0) for e in enriched),
            "total_tokens":  sum(e.get("total_tokens", 0) for e in enriched),
            "cost_usd":      round(sum(e["cost_usd"] for e in enriched), 6),
            "call_count":    len(enriched),
        },
        "by_phase": {
            "generation": {"totals": _phase_totals(gen_entries),  "batches": _phase_batches(gen_entries)},
            "execution":  {"totals": _phase_totals(exec_entries), "batches": _phase_batches(exec_entries)},
            "unknown":    {"totals": _phase_totals(other_entries),"batches": _phase_batches(other_entries)},
        },
        "model_pricing": MODEL_PRICING,
    }


@router.delete("/api/token-usage")
def clear_token_usage(_=Depends(require_role("admin"))):
    try:
        path = os.path.abspath(_TOKEN_LOG_PATH)
        if os.path.exists(path):
            os.remove(path)
        return {"status": "cleared"}
    except Exception as e:
        return {"status": "error", "detail": str(e)}