"""
Profit Navigator — Python Flask Backend
Replaces the Node.js Express server. Handles CRUD + ML model routes.
"""
import os
from dotenv import load_dotenv

load_dotenv()  # Load .env file

from flask import Flask, jsonify
from flask_cors import CORS

from realtime import socketio
from routes.auth_routes import auth_bp
from routes.transactions_routes import transactions_bp
from routes.products_routes import products_bp
from routes.chat_routes import chat_bp
from routes.forecast_routes import forecast_bp
from routes.anomaly_routes import anomaly_bp
from routes.clustering_routes import clustering_bp
from routes.pricing_routes import pricing_bp
from routes.tutorials_routes import tutorials_bp
from routes.visibility_routes import visibility_bp
from routes.data_routes import data_bp
from db import DB_DRIVER
from routes.insights_routes import insights_bp


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


app = Flask(__name__)
app.url_map.strict_slashes = False
CORS(
    app,
    resources={r"/api/*": {"origins": _get_allowed_origins(), "methods": ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]}},
    allow_headers=["Content-Type", "Authorization"],
    supports_credentials=True,
    expose_headers=["Content-Type", "Authorization"],
)

# ── Real-time layer ──────────────────────────────────────────────────────────
# Binds the shared Flask-SocketIO instance (defined in realtime.py) to this app.
# Routes broadcast data changes via emit_change(); the frontend refetches.
socketio.init_app(app)

# ── Register Blueprints ──────────────────────────────────────────────────────
app.register_blueprint(auth_bp, url_prefix="/api/auth")
app.register_blueprint(transactions_bp, url_prefix="/api/transactions")
app.register_blueprint(products_bp, url_prefix="/api/products")
app.register_blueprint(chat_bp, url_prefix="/api/chat")
app.register_blueprint(forecast_bp, url_prefix="/api/forecast")
app.register_blueprint(anomaly_bp, url_prefix="/api/anomaly")
app.register_blueprint(clustering_bp, url_prefix="/api/clustering")
app.register_blueprint(pricing_bp, url_prefix="/api/pricing")
app.register_blueprint(tutorials_bp, url_prefix="/api/tutorials")
app.register_blueprint(visibility_bp, url_prefix="/api/visibility")
app.register_blueprint(data_bp, url_prefix="/api/data")
app.register_blueprint(insights_bp, url_prefix="/api/insights")


@app.route("/api/health")
def health():
    return jsonify({
        "status": "ok",
        "database": "MySQL" if DB_DRIVER == "mysql" else "SQLite (development/test)",
        "models": {
            "forecasting": "Prophet or linear regression",
            "anomaly": "Isolation Forest or z-score fallback",
            "clustering": "K-Means or rule-based fallback",
            "pricing": "Rule-based pricing model",
            "chat": "Groq chat model",
        },
    })


if __name__ == "__main__":
    # Demo data is created explicitly with `python backend/seed_data.py --demo`.
    def init_db_and_seed_tutorials():
        import json
        from db import query, execute
        from werkzeug.security import generate_password_hash

        # 0. Ensure the users, login_otps, and revoked_tokens tables exist and seed demo accounts.
        try:
            execute(
                "CREATE TABLE IF NOT EXISTS users ("
                "id CHAR(36) NOT NULL DEFAULT (UUID()), "
                "name VARCHAR(120) NOT NULL, "
                "email VARCHAR(190) NOT NULL, "
                "phone VARCHAR(30) NULL, "
                "password_hash VARCHAR(255) NOT NULL, "
                "role ENUM('owner','manager','analyst') NOT NULL, "
                "company_id VARCHAR(64) NOT NULL DEFAULT 'default-company', "
                "avatar_url MEDIUMTEXT NULL, "
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "PRIMARY KEY (id), UNIQUE KEY uq_users_email (email)"
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            )
            # Add phone column if database existed prior to phone auth
            try:
                execute("ALTER TABLE users ADD COLUMN phone VARCHAR(30) NULL")
            except Exception:
                pass
            try:
                execute("ALTER TABLE users ADD COLUMN avatar_url MEDIUMTEXT NULL")
            except Exception:
                pass
            try:
                execute("ALTER TABLE users ADD COLUMN company_id VARCHAR(64) NOT NULL DEFAULT 'default-company'")
            except Exception:
                pass

            execute(
                "CREATE TABLE IF NOT EXISTS login_otps ("
                "id CHAR(36) NOT NULL, "
                "identifier VARCHAR(190) NOT NULL, "
                "user_id CHAR(36) NULL, "
                "otp_hash VARCHAR(255) NOT NULL, "
                "expires_at TIMESTAMP NOT NULL, "
                "attempts INT NOT NULL DEFAULT 0, "
                "used TINYINT(1) NOT NULL DEFAULT 0, "
                "last_resend_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "PRIMARY KEY (id)"
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            )

            execute(
                "CREATE TABLE IF NOT EXISTS revoked_tokens ("
                "token_hash VARCHAR(255) NOT NULL, "
                "revoked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, "
                "PRIMARY KEY (token_hash)"
                ") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4"
            )

            DEMO_OWNER_EMAIL = os.environ.get("DEMO_OWNER_EMAIL")
            DEMO_OWNER_PHONE = os.environ.get("DEMO_OWNER_PHONE")
            DEMO_OWNER_PASSWORD = os.environ.get("DEMO_OWNER_PASSWORD")
            DEMO_MANAGER_EMAIL = os.environ.get("DEMO_MANAGER_EMAIL")
            DEMO_MANAGER_PHONE = os.environ.get("DEMO_MANAGER_PHONE")
            DEMO_MANAGER_PASSWORD = os.environ.get("DEMO_MANAGER_PASSWORD")
            DEMO_ANALYST_EMAIL = os.environ.get("DEMO_ANALYST_EMAIL")
            DEMO_ANALYST_PHONE = os.environ.get("DEMO_ANALYST_PHONE")
            DEMO_ANALYST_PASSWORD = os.environ.get("DEMO_ANALYST_PASSWORD")

            if not DEMO_OWNER_EMAIL or not DEMO_OWNER_PASSWORD or not DEMO_MANAGER_EMAIL or not DEMO_MANAGER_PASSWORD or not DEMO_ANALYST_EMAIL or not DEMO_ANALYST_PASSWORD:
                raise RuntimeError("Demo account credentials must be configured in environment variables: DEMO_OWNER_EMAIL/DEMO_OWNER_PASSWORD, DEMO_MANAGER_EMAIL/DEMO_MANAGER_PASSWORD, DEMO_ANALYST_EMAIL/DEMO_ANALYST_PASSWORD.")

            DEFAULT_USERS = [
                ("Business Owner", DEMO_OWNER_EMAIL, DEMO_OWNER_PHONE or "+15550100001", DEMO_OWNER_PASSWORD, "owner"),
                ("Shop Manager", DEMO_MANAGER_EMAIL, DEMO_MANAGER_PHONE or "+15550100002", DEMO_MANAGER_PASSWORD, "manager"),
                ("Financial Analyst", DEMO_ANALYST_EMAIL, DEMO_ANALYST_PHONE or "+15550100003", DEMO_ANALYST_PASSWORD, "analyst"),
            ]
            import uuid
            for name, email, phone, password, role in DEFAULT_USERS:
                existing = query("SELECT id FROM users WHERE email = %s OR phone = %s", (email, phone))
                if not existing:
                    execute(
                        "INSERT INTO users (id, name, email, phone, password_hash, role) "
                        "VALUES (%s, %s, %s, %s, %s, %s)",
                        (str(uuid.uuid4()), name, email, phone, generate_password_hash(password), role),
                    )
                else:
                    # Update phone number for existing demo accounts if null
                    execute("UPDATE users SET phone = %s WHERE email = %s AND (phone IS NULL OR phone = '')", (phone, email))
            print(">>> Users table and OTP tables ready; default accounts seeded with phone credentials.")
        except Exception as e:
            print(f">>> Users seeding warning: {e}")

        # Auto-seed realistic transactions & products if empty
        try:
            tx_count = query("SELECT COUNT(*) as cnt FROM transactions")
            if not tx_count or tx_count[0].get("cnt", 0) == 0:
                print(">>> Transactions table is empty. Seeding realistic sample dataset...")
                import seed_data
                seed_data.main()
        except Exception as e:
            print(f">>> Transactions auto-seed warning: {e}")

        # 1. Modify column width to text to ensure JSON translations fit
        try:
            execute("ALTER TABLE tutorials MODIFY title TEXT NOT NULL")
            execute("ALTER TABLE tutorials MODIFY description TEXT NULL")
            print(">>> Database schema checked: tutorials columns modified to TEXT.")
        except Exception as e:
            pass  # Expected in SQLite or if columns already correct


        # Add per-language video map for databases created before this feature.
        try:
            execute("ALTER TABLE tutorials ADD COLUMN video_ids JSON NULL")
            print(">>> Database schema checked: tutorials.video_ids added.")
        except Exception:
            pass  # Column already exists.

        # 2. Seed default tutorials
        try:
            existing = query("SELECT id FROM tutorials WHERE id LIKE 'default-%'")
            if not existing:
                print(">>> Seeding default tutorials into database...")
                DEFAULT_TUTORIALS = [
                    {
                        "id": "default-1",
                        "title": {
                            "en": "How Great Leaders Inspire Action — Start With Why",
                            "hi": "महान नेता कैसे प्रेरित करते हैं — Why से शुरू करें",
                            "ta": "சிறந்த தலைவர்கள் எவ்வாறு ஊக்கமளிக்கிறார்கள்",
                            "te": "గొప్ప నాయకులు ఎలా స్ఫూర్తి నిస్తారు",
                            "gu": "મહાન નેતાઓ કેવી રીતે પ્રેરણા આપે છે — Why થી શરૂ કરો",
                            "es": "Cómo los grandes líderes inspiran acción",
                        },
                        "description": {
                            "en": "Simon Sinek's legendary talk on what drives business success. Learn the mindset behind building a business that sells itself.",
                            "hi": "Simon Sinek का प्रसिद्ध भाषण — व्यापार सफलता के पीछे की सोच जानें।",
                            "ta": "Simon Sinek-இன் புகழ்பெற்ற உரை — வணிக வெற்றிக்கான மனநிலை.",
                            "te": "Simon Sinek యొక్క ప్రసిద్ధ ప్రసంగం — వ్యాపార విజయం వెనుక ఆలోచన.",
                            "gu": "Simon Sinek નું પ્રખ્યાત ભાષણ — વ્યવસાય સફળતા પાછળની વિચારસરણી.",
                            "es": "La legendaria charla de Simon Sinek sobre el éxito empresarial.",
                        },
                        "youtube_id": "qp0HIF3SfI4",
                        "target_role": "owner"
                    },
                    {
                        "id": "default-2",
                        "title": {
                            "en": "Finance and Investing Fundamentals for Business Owners",
                            "hi": "व्यापार मालिकों के लिए वित्त and निवेश की मूल बातें",
                            "ta": "வணிக உரிமையாளர்களுக்கான நிதி அடிப்படைகள்",
                            "te": "వ్యాపార యజమానులకు ఆర్థిక మూలాలు",
                            "gu": "વ્યવસાય માલિકો માટે નાણાં અને રોકાણ મૂળભૂત",
                            "es": "Fundamentos de finanzas para dueños de negocios",
                        },
                        "description": {
                            "en": "Everything a small business owner needs to know about finance, revenue growth, profit margins, and smart money decisions.",
                            "hi": "छोटे व्यापार मालिकों के लिए वित्त, राजस्व वृद्धि और लाभ मार्जिन की पूरी जानकारी।",
                            "ta": "சிறு வணிக உரிமையாளர்களுக்கு நிதி, வருவாய் வளர்ச்சி பற்றிய முழு தகவல்.",
                            "te": "చిన్న వ్యాపార యజమానులకు ఆర్థిక, ఆదాయ వృద్ధి గురించి పూర్తి సమాచారం.",
                            "gu": "નાના વ્યવસાય માલિકો માટે નાણાં, આવક વૃદ્ધિ અને નફા અંગે સંપૂર્ણ માહિતી.",
                            "es": "Todo lo que un dueño de negocio necesita saber sobre finanzas y crecimiento.",
                        },
                        "youtube_id": "WEDIj9JBTC8",
                        "target_role": "owner"
                    },
                    {
                        "id": "default-3",
                        "title": {
                            "en": "Sales Funnel Strategy for Small Business Owners",
                            "hi": "छोटे व्यापार के लिए सेल्स फनल रणनीति",
                            "ta": "சிறு வணிகத்திற்கான விற்பனை புனல் உத்தி",
                            "te": "చిన్న వ్యాపారానికి సేల్స్ ఫన్నెల్ వ్యూహం",
                            "gu": "નાના વ્યવસાય માટે સેલ્સ ફનલ વ્યૂહ",
                            "es": "Estrategia de embudo de ventas para pequeños negocios",
                        },
                        "description": {
                            "en": "Build a sales funnel that converts leads into paying customers consistently.",
                            "hi": "एक ऐसा सेल्स फनल बनाएं जो लीड्स को नियमित रूप से ग्राहकों में बदले।",
                            "ta": "வாடிக்கையாளர்களை தொடர்ந்து ஈர்க்கும் விற்பனை புனலை உருவாக்குங்கள்.",
                            "te": "లీడ్స్‌ను క్రమంగా కస్టమర్లుగా మార్చే సేల్స్ ఫన్నెల్ నిర్మించండి.",
                            "gu": "લીડ્સને નિયમિત ગ્રાહકોમાં રૂપાંતરિત કરતી સેલ્સ ફનલ બનાવો.",
                            "es": "Construye un embudo de ventas que convierta prospectos en clientes.",
                        },
                        "youtube_id": "Y3Rs1z7it5M",
                        "target_role": "owner"
                    },
                    {
                        "id": "default-4",
                        "title": {
                            "en": "What Is Data Analytics? — Use Data to Grow Your Business",
                            "hi": "डेटा एनालिटिक्स क्या है? — डेटा से व्यापार बढ़ाएं",
                            "ta": "தரவு பகுப்பாய்வு என்றால் என்ன? — வணிகத்தை வளர்க்க",
                            "te": "డేటా అనలిటిక్స్ అంటే ఏమిటి? — వ్యాపారాన్ని పెంచండి",
                            "gu": "ડેટા એનાલિટિક્સ શું છે? — ડેટાથી વ્યવસાય વધારો",
                            "es": "¿Qué es el análisis de datos? — Úsalo para crecer",
                        },
                        "description": {
                            "en": "Use your sales data and analytics to identify best-selling products, peak hours, and growth opportunities.",
                            "hi": "अपने बिक्री डेटा का उपयोग करके सबसे अच्छे उत्पाद और विकास के अवसर खोजें।",
                            "ta": "உங்கள் விற்பனை தரவை பயன்படுத்தி சிறந்த தயாரிப்புகளை கண்டறியுங்கள்.",
                            "te": "మీ అమ్మకాల డేటాను ఉపయోగించి ఉత్తమ ఉత్పత్తులు మరియు అవకాశాలు కనుగొనండి.",
                            "gu": "તમારા વેચાણ ડેટાનો ઉપયોગ કરીને શ્રેષ્ઠ ઉત્પાદનો અને વૃદ્ધિ તકો શોધો.",
                            "es": "Usa tus datos de ventas para identificar productos estrella y oportunidades.",
                        },
                        "youtube_id": "yZvFH7B6gKI",
                        "target_role": "owner"
                    },
                    {
                        "id": "default-5",
                        "title": {
                            "en": "Think Fast, Talk Smart — Communication for Business Growth",
                            "hi": "तेज़ सोचें, स्मार्ट बोलें — व्यापार वृद्धि के लिए संचार",
                            "ta": "வேகமாக சிந்தியுங்கள் — வணிக வளர்ச்சிக்கான தொடர்பு",
                            "te": "వేగంగా ఆలోచించండి — వ్యాపార వృద్ధికి కమ్యూనికేషన్",
                            "gu": "ઝડપથી વિચારો — વ્યવસાય વૃદ્ધિ માટે સંચાર",
                            "es": "Piensa rápido, habla inteligente — comunicación para negocios",
                        },
                        "description": {
                            "en": "Master communication techniques to pitch your business, negotiate deals, and persuade customers.",
                            "hi": "अपने व्यापार को पिच करने, सौदे करने और ग्राहकों को मनाने की तकनीकें सीखें।",
                            "ta": "வணிகத்தை முன்வைக்க, பேரம் பேச, வாடிக்கையாளர்களை நம்பவைக்க கற்றுக்கொள்ளுங்கள்.",
                            "te": "వ్యాపారాన్ని పిచ్ చేయడానికి, డీల్స్ చేయడానికి, కస్టమర్లను ఒప్పించడానికి నేర్చుకోండి.",
                            "gu": "વ્યવસાય રજૂ કરવા, સોદા કરવા અને ગ્રાહકોને સમજાવવા માટેની તકનીકો.",
                            "es": "Domina técnicas de comunicación para presentar tu negocio y persuadir clientes.",
                        },
                        "youtube_id": "HAnw168huqA",
                        "target_role": "owner"
                    },
                    {
                        "id": "default-6",
                        "title": {
                            "en": "The Power of Vulnerability — Build Customer Trust",
                            "hi": "भेद्यता की शक्ति — ग्राहक विश्वास बनाएं",
                            "ta": "பாதிப்பின் சக்தி — வாடிக்கையாளர் நம்பிக்கை",
                            "te": "దుర్బలత్వం యొక్క शक्ति — కస్టమర్ నమ్మకం",
                            "gu": "નબળાઈની શક્તિ — ગ્રાહક વિશ્વાસ બનાવો",
                            "es": "El poder de la vulnerabilidad — genera confianza con clientes",
                        },
                        "description": {
                            "en": "Brené Brown's iconic talk on how authenticity and trust drive business loyalty and long-term revenue growth.",
                            "hi": "Brené Brown का प्रसिद्ध भाषण — प्रामाणिकता और विश्वास कैसे व्यापार की वफादारी बढ़ाते हैं।",
                            "ta": "Brené Brown-இன் உரை — நேர்மை மற்றும் நம்பிக்கை வணிக விசுவாசத்தை எவ்வாறு அதிகரிக்கின்றன.",
                            "te": "Brené Brown ప్రసంగం — నిజాయితీ మరియు నమ్మకం వ్యాపార విధేయతను ఎలా పెంచుతాయి.",
                            "gu": "Brené Brown નું ભાષણ — પ્રામાણિકતા અને વિશ્વાસ વ્યવસાય વફાદારી કેવી રીતે વધારે છે.",
                            "es": "La charla icónica de Brené Brown sobre cómo la autenticidad impulsa la lealtad.",
                        },
                        "youtube_id": "iCvmsMzlF7o",
                        "target_role": "owner"
                    },
                    {
                        "id": "default-7",
                        "title": {
                            "en": "Your Body Language Shapes How Customers See You",
                            "hi": "आपकी बॉडी लैंग्वेज ग्राहकों की नज़र में आपकी छवि बनाती है",
                            "ta": "உங்கள் உடல் மொழி வாடிக்கையாளர்கள் உங்களை எப்படி பார்க்கிறார்கள்",
                            "te": "మీ శరీర భాష కస్టమర్లు మిమ్మల్ని ఎలా చూస్తారో నిర్ణయిస్తుంది",
                            "gu": "તમારી બોડી લેંગ્વેજ ગ્રાહકો તમને કેવી રીતે જુએ છે",
                            "es": "Tu lenguaje corporal define cómo te ven los clientes",
                        },
                        "description": {
                            "en": "Amy Cuddy's TED talk on how posture, eye contact, and body language affect how customers trust you.",
                            "hi": "Amy Cuddy का TED भाषण — मुद्रा, आँख का संपर्क और बॉडी लैंग्वेज ग्राहकों के विश्वास को कैसे प्रभावित करते हैं।",
                            "ta": "Amy Cuddy-இன் TED உரை — தோரணை, கண் தொடர்பு வாடிக்கையாளர் நம்பிக்கை எவ்வாறு பாதிக்கின்றன.",
                            "te": "Amy Cuddy TED ప్రసంగం — భంగిమ, కంటి సంబంధం కస్టమర్ నమ్మకాన్ని ఎలా ప్రభావితం చేస్తాయి.",
                            "gu": "Amy Cuddy નું TED ભાષણ — મુદ્રા, આંખ સંપર્ક ગ્રાહક વિશ્વાસ પર કેવી અસર કરે છે.",
                            "es": "La charla TED de Amy Cuddy sobre cómo la postura afecta la confianza del cliente.",
                        },
                        "youtube_id": "Ks-_Mh1QhMc",
                        "target_role": "manager"
                    },
                    {
                        "id": "default-8",
                        "title": {
                            "en": "Think Fast, Talk Smart — Handle Customer Conversations",
                            "hi": "तेज़ सोचें — ग्राहक बातचीत को संभालें",
                            "ta": "வேகமாக சிந்தியுங்கள் — வாடிக்கையாளர் உரையாடல்களை கையாளுங்கள்",
                            "te": "వేగంగా ఆలోచించండి — కస్టమర్ సంభాషణలు నిర్వహించండి",
                            "gu": "ઝડપથી વિચારો — ગ્રાહક વાર્તાલાપ સંભાળો",
                            "es": "Piensa rápido — maneja conversaciones con clientes",
                        },
                        "description": {
                            "en": "Stanford techniques for thinking on your feet and responding to difficult customer questions with confidence.",
                            "hi": "Stanford की तकनीकें — कठिन ग्राहक प्रश्नों का आत्मविश्वास से जवाब देना।",
                            "ta": "Stanford நுட்பங்கள் — கடினமான வாடிக்கையாளர் கேள்விகளுக்கு நம்பிக்கையுடன் பதிலளிக்க.",
                            "te": "Stanford పద్ధతులు — కష్టమైన కస్టమర్ ప్రశ్నలకు నమ్మకంగా సమాధానం ఇవ్వడం.",
                            "gu": "Stanford ની તકનીકો — મુશ્કેલ ગ્રાહક પ્રશ્નોના આત્મવિશ્વાસ સાથે જવાબ.",
                            "es": "Técnicas de Stanford para responder preguntas difíciles de clientes con confianza.",
                        },
                        "youtube_id": "HAnw168huqA",
                        "target_role": "manager"
                    },
                    {
                        "id": "default-9",
                        "title": {
                            "en": "How Great Managers Inspire Their Teams and Customers",
                            "hi": "महान प्रबंधक अपनी टीम और ग्राहकों को कैसे प्रेरित करते हैं",
                            "ta": "சிறந்த மேலாளர்கள் தங்கள் குழுவையும் வாடிக்கையாளர்களையும் எவ்வாறு ஊக்கப்படுத்துகிறார்கள்",
                            "te": "గొప్ప మేనేజర్లు తమ టీమ్ మరియు కస్టమర్లను ఎలా స్ఫూర్తి నిస్తారు",
                            "gu": "મહાન મેનેજર્સ તેમની ટીમ અને ગ્રાહકોને કેવી રીતે પ્રેરણા આપે છે",
                            "es": "Cómo los grandes gerentes inspiran a sus equipos y clientes",
                        },
                        "description": {
                            "en": "Simon Sinek on what separates great managers — lead with empathy and create a customer-first culture.",
                            "hi": "Simon Sinek — महान प्रबंधकों की विशेषताएं, सहानुभूति के साथ नेतृत्व करना।",
                            "ta": "Simon Sinek — சிறந்த மேலாளர்களை வேறுபடுத்துவது என்ன, பச்சாதாபத்துடன் வழிநடத்துவது.",
                            "te": "Simon Sinek — గొప్ప మేనేజర్లను వేరు చేసేది ఏమిటి, సానుభూతితో నాయకత్వం.",
                            "gu": "Simon Sinek — મહાન મેનેજર્સ ને અલગ પાડે છે, સહાનુભૂતિ સાથે નેતૃત્વ.",
                            "es": "Simon Sinek sobre qué diferencia a los grandes gerentes — liderar con empatía.",
                        },
                        "youtube_id": "qp0HIF3SfI4",
                        "target_role": "manager"
                    },
                    {
                        "id": "default-10",
                        "title": {
                            "en": "The Power of Empathy in Customer Service",
                            "hi": "ग्राहक सेवा में सहानुभूति की शक्ति",
                            "ta": "வாடிக்கையாளர் சேவையில் பச்சாதாபத்தின் சக்தி",
                            "te": "కస్టమర్ సేవలో సానుభూతి యొక్క శక్తి",
                            "gu": "ગ્રાહક સેવામાં સહાનુભૂતિની શક્તિ",
                            "es": "El poder de la empatía en el servicio al cliente",
                        },
                        "description": {
                            "en": "Brené Brown on empathy vs sympathy — essential for managers to genuinely connect with and support customers.",
                            "hi": "Brené Brown — सहानुभूति बनाम दया, ग्राहकों से वास्तविक जुड़ाव के लिए।",
                            "ta": "Brené Brown — பச்சாதாபம் vs அனுதாபம், வாடிக்கையாளர்களுடன் உண்மையான தொடர்பு.",
                            "te": "Brené Brown — సానుభూతి vs జాలి, కస్టమర్లతో నిజమైన సంబంధం.",
                            "gu": "Brené Brown — સહાનુભૂતિ vs દયા, ગ્રાહકો સાથે સાચો સંબંધ.",
                            "es": "Brené Brown sobre empatía vs simpatía — conexión genuina con clientes.",
                        },
                        "youtube_id": "iCvmsMzlF7o",
                        "target_role": "manager"
                    },
                    {
                        "id": "default-11",
                        "title": {
                            "en": "How to Master Recruiting and Managing People",
                            "hi": "लोगों की भर्ती और प्रबंधन में महारत कैसे हासिल करें",
                            "ta": "ஆட்சேர்ப்பு மற்றும் மக்களை நிர்வகிப்பதில் தேர்ச்சி பெறுவது எப்படி",
                            "te": "రిక్రూటింగ్ మరియు వ్యక్తులను నిర్వహించడంలో నైపుణ్యం పొందడం",
                            "gu": "ભરતી અને લોકોના સંચાલનમાં નિપુણ કેવી રીતે બનવું",
                            "es": "Cómo dominar el reclutamiento y la gestión de personas",
                        },
                        "description": {
                            "en": "Practical techniques for managers on hiring the right people, building team culture, and handling difficult situations.",
                            "hi": "सही लोगों को काम पर रखने, टीम संस्कृति बनाने और कठिन परिस्थितियों को संभालने की तकनीकें।",
                            "ta": "சரியான நபர்களை நியமிக்க, குழு கலாச்சாரம் உருவாக்க, கடினமான சூழ்நிலைகளை கையாள.",
                            "te": "సరైన వ్యక్తులను నియమించడానికి, టీమ్ సంస్కృతి నిర్మించడానికి, కష్టమైన పరిస్థితులు నిర్వహించడానికి.",
                            "gu": "સાચા લોકોને ભરતી કરવા, ટીમ સંસ્કૃતિ બનાવવા, મુશ્કેલ પરિસ્થિતિઓ સંભાળવા.",
                            "es": "Técnicas para contratar personas correctas, construir cultura de equipo y manejar situaciones difíciles.",
                        },
                        "youtube_id": "sxjgL64czRY",
                        "target_role": "manager"
                    },
                    {
                        "id": "default-12",
                        "title": {
                            "en": "Data Analytics for Managers — Understand Your Customers",
                            "hi": "प्रबंधकों के लिए डेटा एनालिटिक्स — अपने ग्राहकों को समझें",
                            "ta": "மேலாளர்களுக்கான தரவு பகுப்பாய்வு — வாடிக்கையாளர்களை புரிந்துகொள்ளுங்கள்",
                            "te": "మేనేజర్లకు డేటా అనలిటిక్స్ — మీ కస్టమర్లను అర్థం చేసుకోండి",
                            "gu": "મેનેજર્સ માટે ડેટา એનાલિટિક્સ — ગ્રાહકોને સમજો",
                            "es": "Análisis de datos para gerentes — entiende a tus clientes",
                        },
                        "description": {
                            "en": "How managers can use data to understand customer behaviour, identify service gaps, and make better decisions.",
                            "hi": "प्रबंधक डेटा का उपयोग करके ग्राहक व्यवहार को समझ सकते हैं और बेहतर निर्णय ले सकते हैं।",
                            "ta": "மேலாளர்கள் தரவை பயன்படுத்தி வாடிக்கையாளர் நடத்தையை புரிந்துகொண்டு சேவை இடைவெளிகளை கண்டறியலாம்.",
                            "te": "మేనేజర్లు డేటాను ఉపయోగించి కస్టమర్ ప్రవర్తన అర్థం చేసుకుని మెరుగైన నిర్ణయాలు తీసుకోవచ్చు.",
                            "gu": "મેનેજર્સ ડેટાનો ઉપયોગ કરીને ગ્રાહક વ્યવહાર સમજી શ્રેષ્ઠ નિર્ણય લઈ શકે છે.",
                            "es": "Cómo los gerentes pueden usar datos para entender el comportamiento del cliente.",
                        },
                        "youtube_id": "yZvFH7B6gKI",
                        "target_role": "manager"
                    }
                ]
                for t in DEFAULT_TUTORIALS:
                    execute(
                        "INSERT INTO tutorials (id, title, description, youtube_id, target_role) VALUES (%s, %s, %s, %s, %s)",
                        (
                            t["id"],
                            json.dumps(t["title"], ensure_ascii=False),
                            json.dumps(t["description"], ensure_ascii=False),
                            t["youtube_id"],
                            t["target_role"]
                        )
                    )
                print(">>> Seeding completed successfully.")
            else:
                print(">>> Tutorials already seeded in database.")
        except Exception as e:
            print(f">>> Seeding tutorials error: {e}")

    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "false").lower() in {"1", "true", "yes", "on"}
    print(f"\n>>> Profit Navigator Backend running on http://{host}:{port}")
    print(f"   GET  /api/health          - check all models")
    print(f"   GET  /api/transactions     - list transactions")
    print(f"   POST /api/transactions     - create transaction")
    print(f"   GET  /api/products         - list products")
    print(f"   POST /api/products         - create product")
    print(f"   POST /api/forecast         - backend forecasts and rolling-origin metrics")
    print(f"   POST /api/anomaly          - Isolation Forest anomaly detection")
    print(f"   POST /api/clustering       - trend and catalog-relative sales segmentation")
    print(f"   POST /api/pricing          - observed-demand price elasticity")
    print(f"   POST /api/chat             - Groq business chat")
    print(f"   WS   /socket.io            - real-time data_changed events\n")
    socketio.run(app, host=host, port=port, debug=debug, allow_unsafe_werkzeug=True)
