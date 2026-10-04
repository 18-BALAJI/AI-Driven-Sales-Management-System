"""
Real-time layer — shared Flask-SocketIO instance.

Kept in its own module to avoid circular imports: routes import `socketio`
from here, and app.py initialises it with the Flask app.

Uses async_mode="threading" so it runs on the standard Werkzeug dev server
(no eventlet/gevent needed) — simplest setup on Windows.
"""
import os
from flask_socketio import SocketIO


def _get_allowed_origins() -> list[str]:
    raw = os.environ.get("CORS_ALLOWED_ORIGINS", "")
    if not raw:
        return [
            "http://localhost:8080",
            "http://localhost:5173",
            "http://127.0.0.1:8080",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
        ]
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins if origins else ["*"]


socketio = SocketIO(cors_allowed_origins=_get_allowed_origins(), async_mode="threading")


def emit_change(resource: str, action: str = "update", payload: dict | None = None):
    """
    Broadcast a data change to all connected clients.

    Frontend listens for the "data_changed" event and refetches the
    affected resource (transactions, products, pricing, tutorials, visibility).
    """
    data = {"resource": resource, "action": action}
    if payload:
        data.update(payload)
    try:
        socketio.emit("data_changed", data)
    except Exception:
        # Never let a websocket emit failure break an API request.
        pass
