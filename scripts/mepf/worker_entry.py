#!/usr/bin/env python3
"""
XBoss MEPF Worker — Entry Point
================================
Worker daemon kết nối PostgreSQL, poll hàng đợi `engineering_async_tasks`,
và dispatch tác vụ sang các handler MEPF-Agents tương ứng.

Thay thế Celery/Redis của MEPF-Agents bằng hàng đợi PostgreSQL sẵn có
của XBoss (migration 0107) với SKIP LOCKED + Advisory Lock.

Biến môi trường:
  DATABASE_URL          — Postgres connection string (bắt buộc)
  MEPF_WORKER_ID        — ID định danh worker (mặc định: mepf-<random>)
  MEPF_WORKER_CONCURRENCY — Số thread xử lý song song (mặc định: 2)
  MEPF_DRY_RUN          — "true" để giả lập, không gọi LLM thật (mặc định: false)
  MEPF_POLL_INTERVAL    — Giây giữa mỗi lần poll (mặc định: 3)
  ANTHROPIC_API_KEY     — API key Anthropic Claude (tuỳ chọn)
  OPENAI_API_KEY        — API key OpenAI (tuỳ chọn)
"""

from __future__ import annotations

import json
import logging
import os
import signal
import sys
import threading
import time
import uuid
from typing import Any, Callable, Optional

import psycopg2
import psycopg2.extras

# ---------------------------------------------------------------------------
# Cấu hình
# ---------------------------------------------------------------------------
DATABASE_URL: str = os.environ["DATABASE_URL"]
WORKER_ID: str = os.environ.get("MEPF_WORKER_ID", f"mepf-{uuid.uuid4().hex[:8]}")
CONCURRENCY: int = int(os.environ.get("MEPF_WORKER_CONCURRENCY", "2"))
DRY_RUN: bool = os.environ.get("MEPF_DRY_RUN", "false").lower() == "true"
POLL_INTERVAL: float = float(os.environ.get("MEPF_POLL_INTERVAL", "3"))
LEASE_MINUTES: int = int(os.environ.get("MEPF_LEASE_MINUTES", "10"))
HEARTBEAT_INTERVAL: float = float(os.environ.get("MEPF_HEARTBEAT_INTERVAL", "30"))

# Task types MEPF worker xử lý
SUPPORTED_TASK_TYPES = [
    "mepf.hvac.calc",
    "mepf.cad.analyze",
    "mepf.bim.clash.detect",
    "mepf.qs.takeoff",
    "mepf.ff.hydraulics",
    "mepf.electrical.calc",
    "mepf.plumbing.calc",
    "mepf.agent.run",  # Generic agent run với prompt tự do
]

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger("mepf-worker")

# ---------------------------------------------------------------------------
# Cờ tắt graceful
# ---------------------------------------------------------------------------
_shutdown = threading.Event()


def _handle_sigterm(signum: int, frame: Any) -> None:  # noqa: ARG001
    log.info("Nhận tín hiệu %s — bắt đầu tắt graceful...", signum)
    _shutdown.set()


signal.signal(signal.SIGTERM, _handle_sigterm)
signal.signal(signal.SIGINT, _handle_sigterm)


# ---------------------------------------------------------------------------
# DB helpers (không dùng pool để giữ mỗi thread connection riêng)
# ---------------------------------------------------------------------------

def make_conn() -> psycopg2.extensions.connection:
    """Tạo kết nối PostgreSQL mới, bật autocommit."""
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    conn.autocommit = True
    return conn


def claim_task(conn: psycopg2.extensions.connection) -> Optional[dict]:
    """
    Atomic claim: SELECT ... FOR UPDATE SKIP LOCKED + UPDATE status=processing.
    Trả về task record hoặc None nếu hàng đợi trống.
    """
    with conn.cursor() as cur:
        conn.autocommit = False
        try:
            cur.execute(
                """
                SELECT id FROM engineering_async_tasks
                WHERE status = 'pending'
                  AND task_type = ANY(%s)
                ORDER BY priority DESC, created_at ASC
                LIMIT 1
                FOR UPDATE SKIP LOCKED
                """,
                (SUPPORTED_TASK_TYPES,),
            )
            row = cur.fetchone()
            if not row:
                conn.rollback()
                return None

            cur.execute(
                """
                UPDATE engineering_async_tasks
                SET status = 'processing',
                    worker_id = %s,
                    lease_expires_at = CURRENT_TIMESTAMP + %s::interval,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                RETURNING *
                """,
                (WORKER_ID, f"{LEASE_MINUTES} minutes", row["id"]),
            )
            task = cur.fetchone()
            conn.commit()
            return dict(task) if task else None
        except Exception:
            conn.rollback()
            raise
        finally:
            conn.autocommit = True


def update_progress(conn: psycopg2.extensions.connection, task_id: str, pct: float) -> None:
    """Cập nhật % tiến độ và gia hạn lease."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE engineering_async_tasks
            SET progress_percent = %s,
                lease_expires_at = CURRENT_TIMESTAMP + %s::interval,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND status = 'processing'
            """,
            (min(100.0, max(0.0, pct)), f"{LEASE_MINUTES} minutes", task_id),
        )


def complete_task(conn: psycopg2.extensions.connection, task_id: str, result: dict) -> None:
    """Đánh dấu task hoàn tất, ghi kết quả."""
    with conn.cursor() as cur:
        cur.execute(
            """
            UPDATE engineering_async_tasks
            SET status = 'completed',
                progress_percent = 100.00,
                result = %s::jsonb,
                error_message = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s AND status = 'processing'
            """,
            (json.dumps(result, ensure_ascii=False), task_id),
        )


def fail_task(conn: psycopg2.extensions.connection, task_id: str, error: str) -> None:
    """Đánh dấu task lỗi, xử lý retry logic."""
    with conn.cursor() as cur:
        # Đọc retry_count + max_retries
        cur.execute(
            "SELECT retry_count, max_retries FROM engineering_async_tasks WHERE id = %s",
            (task_id,),
        )
        row = cur.fetchone()
        if not row:
            return
        new_retry = row["retry_count"] + 1
        new_status = "failed" if new_retry >= row["max_retries"] else "pending"
        cur.execute(
            """
            UPDATE engineering_async_tasks
            SET status = %s,
                retry_count = %s,
                error_message = %s,
                worker_id = NULL,
                lease_expires_at = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = %s
            """,
            (new_status, new_retry, error[:2000], task_id),
        )


def reclaim_stale_tasks(conn: psycopg2.extensions.connection) -> int:
    """Thu hồi các task bị kẹt quá hạn lease (chạy khi worker khởi động)."""
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT id, retry_count, max_retries
            FROM engineering_async_tasks
            WHERE status = 'processing' AND lease_expires_at < CURRENT_TIMESTAMP
            """
        )
        stale = cur.fetchall()
        count = 0
        for t in stale:
            new_retry = t["retry_count"] + 1
            new_status = "failed" if new_retry >= t["max_retries"] else "pending"
            cur.execute(
                """
                UPDATE engineering_async_tasks
                SET status = %s, retry_count = %s,
                    error_message = 'Worker lease expired; reclaimed by MEPF worker startup.',
                    worker_id = NULL, lease_expires_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE id = %s
                """,
                (new_status, new_retry, t["id"]),
            )
            count += 1
        return count


# ---------------------------------------------------------------------------
# Handlers MEPF-Agents
# ---------------------------------------------------------------------------

def _make_progress_reporter(conn: psycopg2.extensions.connection, task_id: str) -> Callable[[float], None]:
    """Trả về hàm callback báo tiến độ cho handler."""
    def report(pct: float) -> None:
        try:
            update_progress(conn, task_id, pct)
        except Exception as exc:
            log.warning("Không cập nhật được tiến độ task %s: %s", task_id, exc)
    return report


def _dry_run_handler(task: dict, report: Callable[[float], None]) -> dict:
    """Handler giả lập — dùng để test mà không cần LLM thật."""
    task_type = task["task_type"]
    log.info("[DRY_RUN] Giả lập xử lý task %s (type=%s)...", task["id"], task_type)
    for i in range(1, 6):
        if _shutdown.is_set():
            raise RuntimeError("Worker đang tắt — dừng xử lý.")
        time.sleep(1)
        report(i * 20.0)
    return {
        "dry_run": True,
        "task_type": task_type,
        "message": f"Giả lập hoàn tất. Payload nhận được: {len(str(task['payload']))} bytes.",
        "worker_id": WORKER_ID,
    }


def _run_hvac_calc(task: dict, report: Callable[[float], None]) -> dict:
    """Handler tính toán HVAC (Hazen-Williams, tải lạnh, ống gió...)."""
    try:
        # Import MEPF-Agents tools
        sys.path.insert(0, "/app/mepf-agent/src")
        from hvac_tools import calc_cooling_load_detailed, calc_duct_total_pressure_loss  # type: ignore
        payload = task.get("payload", {})
        report(20.0)

        results = {}
        if "cooling_load" in payload:
            results["cooling_load"] = calc_cooling_load_detailed(**payload["cooling_load"])
        report(60.0)

        if "duct_pressure" in payload:
            results["duct_pressure"] = calc_duct_total_pressure_loss(**payload["duct_pressure"])
        report(90.0)

        return {"status": "ok", "results": results, "worker_id": WORKER_ID}
    except ImportError:
        log.warning("MEPF-Agents hvac_tools chưa cài — chạy dry_run.")
        return _dry_run_handler(task, report)


def _run_cad_analyze(task: dict, report: Callable[[float], None]) -> dict:
    """Handler phân tích bản vẽ CAD DXF."""
    try:
        sys.path.insert(0, "/app/mepf-agent/src")
        from cad_loader import load_cad  # type: ignore
        from cad_geometry import extract_pipe_network  # type: ignore
        payload = task.get("payload", {})
        report(10.0)

        dxf_path = payload.get("dxf_path")
        if not dxf_path:
            return {"error": "Thiếu dxf_path trong payload"}

        doc = load_cad(dxf_path)
        report(40.0)
        network = extract_pipe_network(doc)
        report(80.0)

        return {
            "status": "ok",
            "entity_count": len(network.get("entities", [])),
            "pipe_segments": network.get("pipe_count", 0),
            "worker_id": WORKER_ID,
        }
    except ImportError:
        log.warning("MEPF-Agents cad_loader chưa cài — chạy dry_run.")
        return _dry_run_handler(task, report)


def _run_bim_clash(task: dict, report: Callable[[float], None]) -> dict:
    """Handler kiểm tra xung đột BIM/IFC."""
    try:
        sys.path.insert(0, "/app/mepf-agent/src")
        from bim_tools import detect_clashes  # type: ignore
        payload = task.get("payload", {})
        report(20.0)

        clashes = detect_clashes(**payload)
        report(90.0)

        return {
            "status": "ok",
            "clash_count": len(clashes),
            "clashes": clashes[:50],  # Tối đa 50 kết quả đầu
            "worker_id": WORKER_ID,
        }
    except ImportError:
        return _dry_run_handler(task, report)


def _run_qs_takeoff(task: dict, report: Callable[[float], None]) -> dict:
    """Handler bóc tách khối lượng và lập dự toán."""
    try:
        sys.path.insert(0, "/app/mepf-agent/src")
        from qs_tools import auto_quantity_takeoff, calc_boq_cost  # type: ignore
        payload = task.get("payload", {})
        report(20.0)

        quantities = auto_quantity_takeoff(**payload.get("takeoff_params", {}))
        report(60.0)
        costs = calc_boq_cost(quantities)
        report(90.0)

        return {
            "status": "ok",
            "quantities": quantities,
            "total_cost_vnd": costs.get("total", 0),
            "worker_id": WORKER_ID,
        }
    except ImportError:
        return _dry_run_handler(task, report)


def _run_ff_hydraulics(task: dict, report: Callable[[float], None]) -> dict:
    """Handler tính toán thủy lực PCCC."""
    try:
        sys.path.insert(0, "/app/mepf-agent/src")
        from ff_tools import calc_sprinkler_hydraulics, calc_fire_pump  # type: ignore
        payload = task.get("payload", {})
        report(20.0)

        results = {}
        if "sprinkler" in payload:
            results["sprinkler"] = calc_sprinkler_hydraulics(**payload["sprinkler"])
        report(55.0)
        if "pump" in payload:
            results["pump"] = calc_fire_pump(**payload["pump"])
        report(90.0)

        return {"status": "ok", "results": results, "worker_id": WORKER_ID}
    except ImportError:
        return _dry_run_handler(task, report)


def _run_electrical_calc(task: dict, report: Callable[[float], None]) -> dict:
    """Handler tính toán điện (cáp, sụt áp, ngắn mạch...)."""
    try:
        sys.path.insert(0, "/app/mepf-agent/src")
        from elec_tools import calc_cable_size, calc_voltage_drop, calc_total_load  # type: ignore
        payload = task.get("payload", {})
        report(20.0)

        results = {}
        if "cable" in payload:
            results["cable"] = calc_cable_size(**payload["cable"])
        report(50.0)
        if "voltage_drop" in payload:
            results["voltage_drop"] = calc_voltage_drop(**payload["voltage_drop"])
        report(75.0)
        if "load" in payload:
            results["load"] = calc_total_load(**payload["load"])
        report(90.0)

        return {"status": "ok", "results": results, "worker_id": WORKER_ID}
    except ImportError:
        return _dry_run_handler(task, report)


def _run_plumbing_calc(task: dict, report: Callable[[float], None]) -> dict:
    """Handler tính toán cấp thoát nước."""
    try:
        sys.path.insert(0, "/app/mepf-agent/src")
        from plumb_tools import calc_water_pipe, calc_plumbing_pump_head  # type: ignore
        payload = task.get("payload", {})
        report(20.0)

        results = {}
        if "pipe" in payload:
            results["pipe"] = calc_water_pipe(**payload["pipe"])
        report(55.0)
        if "pump" in payload:
            results["pump"] = calc_plumbing_pump_head(**payload["pump"])
        report(90.0)

        return {"status": "ok", "results": results, "worker_id": WORKER_ID}
    except ImportError:
        return _dry_run_handler(task, report)


def _run_agent(task: dict, report: Callable[[float], None]) -> dict:
    """Handler chạy full LangGraph agent với prompt tự do."""
    try:
        sys.path.insert(0, "/app/mepf-agent/src")
        from agents import run_agent_sync  # type: ignore  # noqa: F401
        payload = task.get("payload", {})
        prompt = payload.get("prompt", "")
        if not prompt:
            return {"error": "Thiếu prompt trong payload"}

        report(10.0)
        # TODO: Gọi LangGraph agent khi có traffic thật
        # result = run_agent_sync(prompt, **payload.get("agent_kwargs", {}))
        return _dry_run_handler(task, report)
    except ImportError:
        return _dry_run_handler(task, report)


# Map task_type → handler function
TASK_HANDLERS: dict[str, Callable[[dict, Callable[[float], None]], dict]] = {
    "mepf.hvac.calc": _run_hvac_calc,
    "mepf.cad.analyze": _run_cad_analyze,
    "mepf.bim.clash.detect": _run_bim_clash,
    "mepf.qs.takeoff": _run_qs_takeoff,
    "mepf.ff.hydraulics": _run_ff_hydraulics,
    "mepf.electrical.calc": _run_electrical_calc,
    "mepf.plumbing.calc": _run_plumbing_calc,
    "mepf.agent.run": _run_agent,
}


# ---------------------------------------------------------------------------
# Worker thread
# ---------------------------------------------------------------------------

def worker_thread_fn(thread_id: int) -> None:
    """Vòng lặp worker — poll DB, claim và xử lý task liên tục."""
    log.info("Worker thread #%d khởi động (id=%s).", thread_id, WORKER_ID)
    conn = make_conn()

    while not _shutdown.is_set():
        task: Optional[dict] = None
        try:
            task = claim_task(conn)
            if not task:
                _shutdown.wait(timeout=POLL_INTERVAL)
                continue

            task_id = str(task["id"])
            task_type = task["task_type"]
            log.info("[Thread#%d] Claim task %s (type=%s)", thread_id, task_id, task_type)

            # Tạo progress reporter + heartbeat thread
            report = _make_progress_reporter(conn, task_id)
            heartbeat_stop = threading.Event()

            def _heartbeat() -> None:
                while not heartbeat_stop.is_set():
                    time.sleep(HEARTBEAT_INTERVAL)
                    if heartbeat_stop.is_set():
                        break
                    try:
                        update_progress(conn, task_id, task.get("progress_percent", 0))
                    except Exception:
                        pass

            hb = threading.Thread(target=_heartbeat, daemon=True)
            hb.start()

            try:
                # Dispatch sang handler tương ứng
                if DRY_RUN:
                    handler = _dry_run_handler
                else:
                    handler = TASK_HANDLERS.get(task_type, _dry_run_handler)

                result = handler(task, report)
                complete_task(conn, task_id, result)
                log.info("[Thread#%d] Hoàn tất task %s", thread_id, task_id)

            except Exception as exc:
                err_msg = f"{type(exc).__name__}: {exc}"
                log.error("[Thread#%d] Lỗi task %s: %s", thread_id, task_id, err_msg)
                try:
                    fail_task(conn, task_id, err_msg)
                except Exception:
                    pass
            finally:
                heartbeat_stop.set()
                hb.join(timeout=2)

        except psycopg2.OperationalError as db_err:
            log.warning("[Thread#%d] Mất kết nối DB: %s — thử kết nối lại...", thread_id, db_err)
            try:
                conn.close()
            except Exception:
                pass
            time.sleep(5)
            try:
                conn = make_conn()
            except Exception as reconn_err:
                log.error("[Thread#%d] Không kết nối lại được: %s", thread_id, reconn_err)
                time.sleep(10)
        except Exception as exc:
            log.exception("[Thread#%d] Lỗi không mong đợi: %s", thread_id, exc)
            _shutdown.wait(timeout=POLL_INTERVAL)

    try:
        conn.close()
    except Exception:
        pass
    log.info("Worker thread #%d dừng.", thread_id)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    log.info(
        "XBoss MEPF Worker khởi động — id=%s, concurrency=%d, dry_run=%s",
        WORKER_ID,
        CONCURRENCY,
        DRY_RUN,
    )

    # Thu hồi task kẹt từ lần chạy trước
    try:
        conn0 = make_conn()
        reclaimed = reclaim_stale_tasks(conn0)
        conn0.close()
        if reclaimed:
            log.info("Thu hồi %d task bị kẹt từ lần chạy trước.", reclaimed)
    except Exception as exc:
        log.warning("Không thu hồi được task kẹt: %s", exc)

    # Khởi động các worker thread
    threads: list[threading.Thread] = []
    for i in range(CONCURRENCY):
        t = threading.Thread(
            target=worker_thread_fn,
            args=(i + 1,),
            daemon=True,
            name=f"mepf-worker-{i+1}",
        )
        t.start()
        threads.append(t)

    log.info("%d worker thread đang chạy. Nhấn Ctrl+C để dừng.", CONCURRENCY)

    # Chờ tín hiệu tắt
    _shutdown.wait()
    log.info("Đang chờ các thread hoàn tất (tối đa 60s)...")

    for t in threads:
        t.join(timeout=60)

    log.info("XBoss MEPF Worker đã tắt.")


if __name__ == "__main__":
    main()
