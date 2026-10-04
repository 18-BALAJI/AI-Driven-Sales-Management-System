"""
Tutorials routes — Financial Analyst adds YouTube tutorials targeted at
the Owner and/or Manager roles. Replaces the old localStorage store.
"""
import json
import uuid
from flask import Blueprint, request, jsonify
from db import query, execute
from realtime import emit_change

tutorials_bp = Blueprint("tutorials", __name__)

# Languages that may carry a dedicated translated video.
VIDEO_LANGS = ("hi", "ta", "te", "gu", "es")


def _parse_video_ids(raw):
    """JSON columns may come back as str (or already-decoded) — normalise to dict."""
    if not raw:
        return {}
    if isinstance(raw, dict):
        return raw
    try:
        parsed = json.loads(raw)
        return parsed if isinstance(parsed, dict) else {}
    except (ValueError, TypeError):
        return {}


def _clean_video_ids(value):
    """Keep only known language codes mapped to non-empty string IDs."""
    if not isinstance(value, dict):
        return {}
    return {
        lang: vid.strip()
        for lang, vid in value.items()
        if lang in VIDEO_LANGS and isinstance(vid, str) and vid.strip()
    }


def _serialize(r):
    return {
        "id": r["id"],
        "title": r["title"],
        "description": r["description"],
        "youtubeId": r["youtube_id"],
        "targetRole": r["target_role"],
        "videoIds": _parse_video_ids(r.get("video_ids")),
        "addedAt": str(r["created_at"]),
    }


@tutorials_bp.route("/", methods=["GET"])
def list_tutorials():
    """GET /api/tutorials[?role=owner|manager] — list tutorials, optionally by role."""
    role = request.args.get("role")
    if role in ("owner", "manager"):
        rows = query(
            "SELECT * FROM tutorials WHERE target_role = %s OR target_role = 'both' "
            "ORDER BY created_at DESC",
            (role,),
        )
    else:
        rows = query("SELECT * FROM tutorials ORDER BY created_at DESC")
    return jsonify([_serialize(r) for r in rows])


@tutorials_bp.route("/", methods=["POST"])
def create_tutorial():
    """POST /api/tutorials — add a tutorial."""
    body = request.get_json(force=True)
    youtube_id = (body.get("youtubeId") or "").strip()
    title = (body.get("title") or "").strip()
    if not title or not youtube_id:
        return jsonify({"error": "title and youtubeId are required"}), 400

    target_role = body.get("targetRole", "both")
    if target_role not in ("owner", "manager", "both"):
        target_role = "both"

    video_ids = _clean_video_ids(body.get("videoIds"))

    tid = str(uuid.uuid4())
    execute(
        "INSERT INTO tutorials (id, title, description, youtube_id, target_role, video_ids) "
        "VALUES (%s, %s, %s, %s, %s, %s)",
        (
            tid,
            title,
            body.get("description", ""),
            youtube_id,
            target_role,
            json.dumps(video_ids) if video_ids else None,
        ),
    )
    emit_change("tutorials", "create", {"id": tid})
    return jsonify({"id": tid}), 201


@tutorials_bp.route("/<tid>", methods=["PUT"])
def update_tutorial(tid):
    """PUT /api/tutorials/<id> — edit an existing tutorial."""
    body = request.get_json(force=True)
    fields, values = [], []
    # Map camelCase request keys to DB columns.
    col_map = {
        "title": "title",
        "description": "description",
        "youtubeId": "youtube_id",
        "targetRole": "target_role",
    }
    for key, col in col_map.items():
        if key in body:
            value = body[key]
            if col == "target_role" and value not in ("owner", "manager", "both"):
                value = "both"
            fields.append(f"{col} = %s")
            values.append(value)

    # videoIds is a JSON column, handled separately from the simple text columns.
    if "videoIds" in body:
        cleaned = _clean_video_ids(body.get("videoIds"))
        fields.append("video_ids = %s")
        values.append(json.dumps(cleaned) if cleaned else None)

    if not fields:
        return jsonify({"error": "No fields to update"}), 400

    values.append(tid)
    execute(f"UPDATE tutorials SET {', '.join(fields)} WHERE id = %s", values)
    emit_change("tutorials", "update", {"id": tid})
    return jsonify({"success": True})


@tutorials_bp.route("/<tid>", methods=["DELETE"])
def delete_tutorial(tid):
    """DELETE /api/tutorials/<id>."""
    execute("DELETE FROM tutorials WHERE id = %s", (tid,))
    emit_change("tutorials", "delete", {"id": tid})
    return jsonify({"success": True})
