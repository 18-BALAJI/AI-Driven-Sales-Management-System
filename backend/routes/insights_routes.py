"""Company-scoped data context and grounded executive insight endpoints."""
from flask import Blueprint, jsonify, request

from middleware.auth_middleware import require_auth
from services.business_context import build_business_context
from services.insights import InsightGenerationError, generate_executive_insights
from routes.auth_routes import DEFAULT_COMPANY_ID

insights_bp = Blueprint("insights", __name__)


def _company_id() -> str:
    return request.current_user.get("company_id") or DEFAULT_COMPANY_ID


@insights_bp.route("/context", methods=["GET"])
@require_auth
def business_context():
    """Return source-numbered, authenticated business facts for Ask Your Data."""
    return jsonify(build_business_context(_company_id()))


@insights_bp.route("/executive", methods=["POST"])
@require_auth
def executive_insights():
    """Generate a sourced executive summary and explainable business findings."""
    context = build_business_context(_company_id())
    try:
        return jsonify(generate_executive_insights(context))
    except InsightGenerationError as error:
        status = 503 if "GROQ_API_KEY is not configured" in str(error) else 502
        return jsonify({"error": str(error)}), status
