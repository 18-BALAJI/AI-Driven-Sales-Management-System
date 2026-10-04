"""
Chat routes — history + SSE streaming via OpenAI.
"""
import os
import uuid
import json
import requests
from flask import Blueprint, request, jsonify, Response, stream_with_context
from db import current_timestamp_sql, execute, query
from middleware.auth_middleware import require_auth
from routes.auth_routes import DEFAULT_COMPANY_ID
from services.business_context import build_business_context, format_context_for_prompt

chat_bp = Blueprint("chat", __name__)

# Groq is OpenAI-compatible (same /chat/completions schema + SSE delta format),
# so the frontend stream parser works unchanged.
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b"
FALLBACK_GROQ_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.6-27b"]

SYSTEM_PROMPT = (
    "You are an expert AI business advisor and assistant for Profit Navigator (a small business analytics platform). "
    "You communicate naturally, intelligently, and warmly just like ChatGPT. "
    "\n\n"
    "CRITICAL RULE 1 — NATURAL HUMAN LANGUAGE & TYPO TOLERANCE: "
    "You MUST understand human natural language, informal speech, casual phrasing, slang, and text with typos, misspellings, or grammatical mistakes "
    "(for example: 'profitt', 'revnue', 'how to incrase sales', 'wuts my margin', 'help me plzz', 'iy is working', 'shuld i increse pricing'). "
    "NEVER reject or fail a message due to typos, misspellings, or shorthand. Automatically infer the user's true intent, "
    "correct the typos mentally, and provide a comprehensive, direct, and helpful answer. "
    "\n\n"
    "CRITICAL RULE 2 — GREETINGS & CONVERSATIONAL CHAT: "
    "If the user greets you (e.g. 'Hi', 'Hello', 'How are you?', 'Epdi irukinga', 'Namaste'), respond warmly and politely in their language "
    "and invite them to ask about their business, sales, expenses, products, pricing, or dashboard metrics. "
    "\n\n"
    "CRITICAL RULE 3 — BUSINESS ADVICE & FORMATTING: "
    "Provide practical, actionable, data-driven advice. Use clean markdown formatting with bold headings, bullet points, "
    "and tables when appropriate. Use proper currency symbols ($ or ₹) when discussing financial values. "
    "\n\n"
    "CRITICAL RULE 4 — MULTILINGUAL SCRIPT MATCHING: "
    "Reply in the EXACT SAME language and script as the user's most recent message. "
    "If the user writes in English, reply in English; if in Telugu (తెలుగు), reply in Telugu; if in Hindi (हिंदी), reply in Hindi; "
    "if in Tamil (தமிழ்), reply in Tamil; if in Tanglish/Hinglish, reply naturally in the corresponding friendly style."
)



def get_business_telemetry_context(company_id: str):
    """Return live company-scoped facts and the source catalog for grounded chat."""
    context = build_business_context(company_id)
    return context, format_context_for_prompt(context)


@chat_bp.route("/history", methods=["GET"])
@require_auth
def chat_history():
    """GET /api/chat/history?session_id=default"""
    session_id = request.args.get("session_id", "default")
    rows = query(
        "SELECT role, content FROM chat_messages WHERE company_id = %s AND session_id = %s ORDER BY created_at ASC, id ASC",
        (request.current_user.get("company_id") or DEFAULT_COMPANY_ID, session_id),
    )
    return jsonify(rows)


@chat_bp.route("/sessions", methods=["GET"])
@require_auth
def chat_sessions():
    """GET /api/chat/sessions — return list of past chat sessions with title and date."""
    rows = query(
        "SELECT session_id, "
        "       MIN(created_at) as created_at, "
        "       MAX(created_at) as updated_at, "
        "       COUNT(id) as message_count, "
        "       (SELECT content FROM chat_messages cm2 "
        "        WHERE cm2.company_id = cm.company_id AND cm2.session_id = cm.session_id AND cm2.role = 'user' "
        "        ORDER BY cm2.created_at ASC LIMIT 1) as title "
        "FROM chat_messages cm WHERE cm.company_id = %s "
        "GROUP BY cm.company_id, cm.session_id "
        "ORDER BY updated_at DESC",
        (request.current_user.get("company_id") or DEFAULT_COMPANY_ID,),
    )
    result = []
    for r in rows:
        result.append({
            "session_id": r["session_id"],
            "title": (r.get("title") or "New Chat").strip(),
            "message_count": r.get("message_count", 0),
            "created_at": str(r.get("created_at")),
            "updated_at": str(r.get("updated_at")),
        })
    return jsonify(result)



@chat_bp.route("/save", methods=["POST"])
@require_auth
def save_message():
    """POST /api/chat/save — save a single chat message."""
    body = request.get_json(silent=True) or {}
    if body.get("role") not in {"user", "assistant"} or not isinstance(body.get("content"), str):
        return jsonify({"error": "A user/assistant role and message content are required."}), 400
    mid = str(uuid.uuid4())
    execute(
        f"INSERT INTO chat_messages (id, role, content, session_id, company_id, created_at) VALUES (%s, %s, %s, %s, %s, {current_timestamp_sql()})",
        (mid, body["role"], body["content"], body.get("session_id", "default"), request.current_user.get("company_id") or DEFAULT_COMPANY_ID),
    )
    return jsonify({"id": mid}), 201


@chat_bp.route("/clear", methods=["POST", "DELETE"])
@require_auth
def clear_chat():
    """POST /api/chat/clear or DELETE /api/chat/clear — delete chat history for a session."""
    body = request.get_json(silent=True) or {}
    session_id = body.get("session_id") or request.args.get("session_id", "default")
    execute(
        "DELETE FROM chat_messages WHERE company_id = %s AND session_id = %s",
        (request.current_user.get("company_id") or DEFAULT_COMPANY_ID, session_id),
    )
    return jsonify({"success": True, "message": "Chat history cleared", "session_id": session_id}), 200



@chat_bp.route("/", methods=["POST"])
@require_auth
def chat_stream():
    """POST /api/chat — stream SSE response from OpenAI, save assistant reply to MySQL."""
    body = request.get_json(force=True)
    messages = body.get("messages", [])
    session_id = body.get("session_id", "default")

    if not isinstance(messages, list) or not messages:
        return jsonify({"error": "messages array is required"}), 400
    if len(messages) > 30 or any(
        not isinstance(message, dict)
        or message.get("role") not in {"user", "assistant"}
        or not isinstance(message.get("content"), str)
        for message in messages
    ):
        return jsonify({"error": "messages must contain up to 30 user/assistant text entries."}), 400

    api_key = (os.environ.get("GROQ_API_KEY") or "").strip().strip('"')
    if not api_key or api_key == "your_groq_api_key_here":
        return jsonify({
            "error": "GROQ_API_KEY is not set. Get a free key at "
                     "https://console.groq.com and put it in backend/.env, "
                     "then restart the backend."
        }), 500

    company_id = request.current_user.get("company_id") or DEFAULT_COMPANY_ID
    _, telemetry_context = get_business_telemetry_context(company_id)
    dynamic_system_prompt = (
        SYSTEM_PROMPT
        + " Answer data questions only from the following company-scoped source records. "
        + "Do not invent values; cite factual claims with the supplied IDs like [S1]. "
        + "If a requested fact is not present, say it is unavailable.\n"
        + telemetry_context
    )

    chat_messages = [{"role": "system", "content": dynamic_system_prompt}] + messages


    # Build candidate model list (env model first, then fallback options)
    configured_model = os.environ.get("GROQ_MODEL", DEFAULT_GROQ_MODEL).strip()
    candidate_models = [configured_model]
    for m in FALLBACK_GROQ_MODELS:
        if m not in candidate_models:
            candidate_models.append(m)

    def generate():
        full_content = ""
        resp = None
        last_err = ""

        # Try candidate models until one connects with status 200
        for model_name in candidate_models:
            try:
                r = requests.post(
                    GROQ_URL,
                    headers={
                        "Authorization": f"Bearer {api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "model": model_name,
                        "messages": chat_messages,
                        "stream": True,
                    },
                    stream=True,
                    timeout=60,
                )
                if r.status_code == 200:
                    resp = r
                    break
                else:
                    last_err = f"Model {model_name} failed ({r.status_code}): {r.text[:200]}"
            except Exception as ex:
                last_err = f"Model {model_name} error: {str(ex)}"

        if not resp:
            yield f"data: {json.dumps({'error': last_err or 'Failed to reach Groq API.'})}\n\n"
            return

        try:
            # Iterate raw bytes and decode each full line as UTF-8 directly.
            for raw in resp.iter_lines():
                if not raw:
                    continue
                line = raw.decode("utf-8", errors="replace")
                if not line.startswith("data: "):
                    continue
                json_str = line[6:].strip()
                if json_str == "[DONE]":
                    yield "data: [DONE]\n\n"
                    break
                yield f"{line}\n\n"
                try:
                    parsed = json.loads(json_str)
                    content = parsed.get("choices", [{}])[0].get("delta", {}).get("content", "")
                    if content:
                        full_content += content
                except json.JSONDecodeError:
                    pass

        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"


        # Save assistant message to MySQL
        if full_content:
            mid = str(uuid.uuid4())
            try:
                execute(
                    f"INSERT INTO chat_messages (id, role, content, session_id, company_id, created_at) VALUES (%s, %s, %s, %s, %s, {current_timestamp_sql()})",
                    (mid, "assistant", full_content, session_id, company_id),
                )
            except Exception:
                pass  # Don't break the stream for a DB error

    return Response(
        stream_with_context(generate()),
        content_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
