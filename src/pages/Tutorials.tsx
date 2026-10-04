import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, BookOpen, TrendingUp, Users, DollarSign, BarChart3, Star, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { fetchTutorials } from "@/lib/api";
import { YouTubePlayer } from "@/components/YouTubePlayer";
import { useRealtime } from "@/lib/socket";
import { useRole } from "@/contexts/RoleContext";
import { Link } from "react-router-dom";

type TutorialRole = "owner" | "manager";
type Language = "en" | "hi" | "ta" | "te" | "es" | "gu";

type Tutorial = {
  id: string;
  title: string;
  description: string;
  youtubeId: string;
  targetRole: "owner" | "manager" | "both";
  videoIds?: Record<string, string>;
  addedAt?: string;
};

const languages: { code: Language; label: string; flag: string }[] = [
  { code: "en", label: "English",  flag: "🇬🇧" },
  { code: "hi", label: "हिंदी",    flag: "🇮🇳" },
  { code: "ta", label: "தமிழ்",   flag: "🇮🇳" },
  { code: "te", label: "తెలుగు",  flag: "🇮🇳" },
  { code: "gu", label: "ગુજરાતી", flag: "🇮🇳" },
  { code: "es", label: "Español",  flag: "🇪🇸" },
];

const DEFAULT_METADATA: Record<string, { category: Record<Language, string>; duration: string; icon: any }> = {
  "qp0HIF3SfI4": {
    category: { en: "Sales Strategy", hi: "बिक्री रणनीति", ta: "விற்பனை உத்தி", te: "అమ్మకాల వ్యూహం", gu: "વેચાણ વ્યૂહ", es: "Estrategia de Ventas" },
    duration: "18 min",
    icon: TrendingUp
  },
  "WEDIj9JBTC8": {
    category: { en: "Revenue Growth", hi: "राजस्व वृद्धि", ta: "வருவாய் வளர்ச்சி", te: "ఆదాయ వృద్ధి", gu: "આવક વૃદ્ધિ", es: "Crecimiento de Ingresos" },
    duration: "45 min",
    icon: DollarSign
  },
  "Y3Rs1z7it5M": {
    category: { en: "Sales Strategy", hi: "बिक्री रणनीति", ta: "விற்பனை உத்தி", te: "అమ్మకాల వ్యూహం", gu: "વેચાણ વ્યૂહ", es: "Estrategia de Ventas" },
    duration: "20 min",
    icon: TrendingUp
  },
  "yZvFH7B6gKI": {
    category: { en: "Sales Strategy", hi: "बिक्री रणनीति", ta: "விற்பனை உத்தி", te: "అమ్మకాల వ్యూహం", gu: "વેચાણ વ્યૂહ", es: "Estrategia de Ventas" },
    duration: "16 min",
    icon: BarChart3
  },
  "HAnw168huqA": {
    category: { en: "Revenue Growth", hi: "राजस्व वृद्धि", ta: "வருவாய் வளர்ச்சி", te: "ఆదాయ వృద్ధి", gu: "આવક વૃદ્ધિ", es: "Crecimiento de Ingresos" },
    duration: "10 min",
    icon: DollarSign
  },
  "iCvmsMzlF7o": {
    category: { en: "Business Growth", hi: "व्यापार वृद्धि", ta: "வணிக வளர்ச்சி", te: "వ్యాపార వృద్ధి", gu: "વ્યવસાય વૃદ્ધિ", es: "Crecimiento Empresarial" },
    duration: "20 min",
    icon: Star
  },
  "Ks-_Mh1QhMc": {
    category: { en: "Customer Behaviour", hi: "ग्राहक व्यवहार", ta: "வாடிக்கையாளர் நடத்தை", te: "கస్టమర్ ప్రవర్తన", gu: "ગ્રાહક વ્યવહાર", es: "Comportamiento del Cliente" },
    duration: "21 min",
    icon: Users
  },
  "sxjgL64czRY": {
    category: { en: "Customer Behaviour", hi: "ग्राहक व्यवहार", ta: "வாடிக்கையாளர் நடத்தை", te: "கస్టమర్ ప్రవర్తన", gu: "ગ્રાહક વ્યવહાર", es: "Comportamiento del Cliente" },
    duration: "15 min",
    icon: Users
  }
};

const categoryColors: Record<string, string> = {
  "Sales Strategy":       "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  "Revenue Growth":       "bg-primary/10 text-primary border-primary/20",
  "Business Growth":      "bg-purple-500/10 text-purple-400 border-purple-500/20",
  "Customer Behaviour":   "bg-orange-500/10 text-orange-400 border-orange-500/20",
};

const uiText: Record<Language, {
  title: string; subtitle: string;
  ownerTab: string; managerTab: string;
  ownerBanner: string; managerBanner: string;
  close: string; playing: string;
  langLabel: string;
}> = {
  en: {
    title: "Business Tutorials", subtitle: "Curated YouTube tutorials to help you grow your business",
    ownerTab: "👔 Owner — Sales & Revenue Strategies", managerTab: "🤝 Manager — Customer Skills",
    ownerBanner: "Owner Portal: Tutorials on increasing sales, growing revenue, and scaling your business.",
    managerBanner: "Manager Portal: Tutorials on how to professionally interact with and serve customers.",
    close: "Close", playing: "Playing", langLabel: "Language",
  },
  hi: {
    title: "व्यापार ट्यूटोरियल", subtitle: "आपके व्यापार को बढ़ाने के लिए चुने गए YouTube ट्यूटोरियल",
    ownerTab: "👔 मालिक — बिक्री और राजस्व रणनीतियाँ", managerTab: "🤝 प्रबंधक — ग्राहक कौशल",
    ownerBanner: "मालिक पोर्टल: बिक्री बढ़ाने, राजस्व वृद्धि और व्यापार स्केल करने के ट्यूटोरियल।",
    managerBanner: "प्रबंधक पोर्टल: ग्राहकों के साथ पेशेवर व्यवहार और सेवा के ट्यूटोरियल।",
    close: "बंद करें", playing: "चल रहा है", langLabel: "भाषा",
  },
  ta: {
    title: "வணிக பயிற்சிகள்", subtitle: "உங்கள் வணிகத்தை வளர்க்க தேர்ந்தெடுக்கப்பட்ட YouTube பயிற்சிகள்",
    ownerTab: "👔 உரிமையாளர் — விற்பனை உத்திகள்", managerTab: "🤝 மேலாளர் — வாடிக்கையாளர் திறன்கள்",
    ownerBanner: "உரிமையாளர் போர்டல்: விற்பனை அதிகரிக்க, வருவாய் வளர்க்க பயிற்சிகள்.",
    managerBanner: "மேலாளர் போர்டல்: வாடிக்கையாளர்களுடன் தொழில்முறை தொடர்பு பயிற்சிகள்.",
    close: "மூடு", playing: "இயங்குகிறது", langLabel: "மொழி",
  },
  te: {
    title: "వ్యాపార ట్యుటోరియల్స్", subtitle: "మీ వ్యాపారాన్ని పెంచడానికి ఎంచుకున్న YouTube ట్యుటోరియల్స్",
    ownerTab: "👔 యజమాని — అమ్మకాల వ్యూహాలు", managerTab: "🤝 మేనేజర్ — కస్టమర్ నైపుణ్యాలు",
    ownerBanner: "యజమాని పోర్టల్: అమ్మకాలు పెంచడానికి, ఆదాయ వృద్ధికి ట్యుటోరియల్స్.",
    managerBanner: "మేనేజర్ పోర్టల్: కస్టమర్లతో వృత్తిపరంగా వ్యవహరించడానికి ట్యుటోరియల్స్.",
    close: "మూసివేయి", playing: "ప్లే అవుతోంది", langLabel: "భాష",
  },
  es: {
    title: "Tutoriales de Negocios", subtitle: "Tutoriales de YouTube para hacer crecer tu negocio",
    ownerTab: "👔 Dueño — Estrategias de Ventas", managerTab: "🤝 Gerente — Habilidades con Clientes",
    ownerBanner: "Portal del Dueño: Tutoriales para aumentar ventas, ingresos y escalar tu negocio.",
    managerBanner: "Portal del Gerente: Tutoriales sobre cómo interactuar profesionalmente con clientes.",
    close: "Cerrar", playing: "Reproduciendo", langLabel: "Idioma",
  },
  gu: {
    title: "વ્યવસાય ટ્યુટોરિયલ્સ", subtitle: "તમારો વ્યવસાય વધારવા માટે પસંદ કરેલ YouTube ટ્યુટોરિયલ્સ",
    ownerTab: "👔 માલિક — વેચાણ અને આવક વ્યૂહ", managerTab: "🤝 મેનેજર — ગ્રાહક કૌશલ્ય",
    ownerBanner: "માલિક પોર્ટલ: વેચાણ વધારવા, આવક વૃદ્ધિ અને વ્યવસાય સ્કેલ કરવા ટ્યુટોરિયલ્સ.",
    managerBanner: "મેનેજર પોર્ટલ: ગ્રાહકો સાથે વ્યાવસાયિક રીતે વ્યવહાર કરવા ટ્યુટોરિયલ્સ.",
    close: "બંધ કરો", playing: "ચાલી રહ્યું છે", langLabel: "ભાષા",
  },
};

const getLocalizedText = (
  text: string | Record<string, string> | null | undefined,
  lang: Language
): string => {
  if (!text) return "";
  // Already-parsed localized object (e.g. category metadata).
  if (typeof text === "object") {
    return text[lang] || text["en"] || "";
  }
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object") {
        return parsed[lang] || parsed["en"] || "";
      }
    } catch {}
  }
  return text;
};

export default function Tutorials() {
  const [activeRole, setActiveRole] = useState<TutorialRole>("owner");
  const [activeVideo, setActiveVideo] = useState<Tutorial | null>(null);
  const [lang, setLang] = useState<Language>("en");
  const [videos, setVideos] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const { role: userRole } = useRole();

  const loadVideos = useCallback(async () => {
    try {
      const data = await fetchTutorials();
      setVideos(data);
    } catch {
      setVideos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  useRealtime("tutorials", loadVideos);

  const ui = uiText[lang];

  // Filter tutorials by the active tab (owner or manager)
  const filtered = videos.filter(
    (v) => v.targetRole === activeRole || v.targetRole === "both"
  );

  return (
    <div className="space-y-6">
      {/* Financial Analyst Admin Banner */}
      {userRole === "analyst" && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg bg-primary/10 border border-primary/20 text-primary glow-card">
          <div className="flex items-center gap-3">
            <BookOpen className="h-5 w-5 shrink-0 text-primary" />
            <div>
              <p className="text-sm font-semibold">Financial Analyst Access</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                You can view all tutorials here. To add, edit, or delete tutorials, go to the management dashboard.
              </p>
            </div>
          </div>
          <Link
            to="/analyst-tutorials"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring bg-primary text-primary-foreground shadow hover:bg-primary/95 h-9 px-4 py-2 self-start sm:self-center shrink-0"
          >
            Manage Tutorials
          </Link>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Play className="h-6 w-6 text-primary" />
            {ui.title}
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{ui.subtitle}</p>
        </div>

        {/* Language Selector */}
        <div className="flex items-center gap-2 flex-wrap">
          <Globe className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground font-medium">{ui.langLabel}:</span>
          {languages.map((l) => (
            <button
              key={l.code}
              onClick={() => setLang(l.code)}
              className={cn(
                "px-2.5 py-1 rounded-md text-xs font-medium transition-colors border",
                lang === l.code
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-accent/50 text-muted-foreground border-border hover:text-foreground hover:bg-accent"
              )}
            >
              {l.flag} {l.label}
            </button>
          ))}
        </div>
      </div>

      {/* Role Tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => { setActiveRole("owner"); setActiveVideo(null); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2",
            activeRole === "owner"
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-accent/50 text-muted-foreground border-border hover:text-foreground hover:bg-accent"
          )}
        >
          {ui.ownerTab}
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            activeRole === "owner" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-accent text-muted-foreground"
          )}>
            {videos.filter(v => v.targetRole === "owner" || v.targetRole === "both").length}
          </span>
        </button>
        <button
          onClick={() => { setActiveRole("manager"); setActiveVideo(null); }}
          className={cn(
            "px-4 py-2 rounded-lg text-sm font-medium transition-colors border flex items-center gap-2",
            activeRole === "manager"
              ? "bg-orange-500 text-white border-orange-500"
              : "bg-accent/50 text-muted-foreground border-border hover:text-foreground hover:bg-accent"
          )}
        >
          {ui.managerTab}
          <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full",
            activeRole === "manager" ? "bg-white/20 text-white" : "bg-accent text-muted-foreground"
          )}>
            {videos.filter(v => v.targetRole === "manager" || v.targetRole === "both").length}
          </span>
        </button>
      </div>

      {/* Banner */}
      {activeRole === "owner" ? (
        <div className="flex items-center gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-4">
          <TrendingUp className="h-5 w-5 text-emerald-400 shrink-0" />
          <p className="text-sm text-emerald-400">{ui.ownerBanner}</p>
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-lg bg-orange-500/10 border border-orange-500/20 p-4">
          <Users className="h-5 w-5 text-orange-400 shrink-0" />
          <p className="text-sm text-orange-400">{ui.managerBanner}</p>
        </div>
      )}

      {/* Video Player */}
      <AnimatePresence>
        {activeVideo && (
          <motion.div className="glow-card overflow-hidden" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{getLocalizedText(activeVideo.title, lang)}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{getLocalizedText(activeVideo.description, lang)}</p>
              </div>
              <button onClick={() => setActiveVideo(null)}
                className="text-muted-foreground hover:text-foreground text-xs px-3 py-1 rounded-md bg-accent hover:bg-accent/80 transition-colors ml-4 shrink-0">
                {ui.close}
              </button>
            </div>
            {activeVideo.videoIds?.[lang] && lang !== "en" && (
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border-b border-emerald-500/20 text-xs text-emerald-400">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                Playing the {languages.find((l) => l.code === lang)?.label} version of this video.
              </div>
            )}
            {lang !== "en" && !activeVideo.videoIds?.[lang] && (
              <div className="flex items-center gap-2 px-4 py-2 bg-primary/10 border-b border-primary/20 text-xs text-primary">
                <Globe className="h-3.5 w-3.5 shrink-0" />
                {lang === "te" && "వీడియో తెలుగు సబ్‌టైటిల్స్‌తో ప్లే అవుతోంది. CC బటన్ నొక్కండి."}
                {lang === "hi" && "वीडियो हिंदी सबटाइटल के साथ चल रहा है। CC बटन दबाएं।"}
                {lang === "ta" && "வீడియో தமிழ் வசனங்களுடன் இயங்குகிறது. CC பொத்தானை அழுத்தவும்."}
                {lang === "gu" && "વીડિયો ગુજરાતી સબટાઇટલ સાથે ચાલી રહ્યો છે. CC બટન દબાવો."}
                {lang === "es" && "El video se reproduce con subtítulos en español. Presiona CC."}
              </div>
            )}
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <YouTubePlayer
                key={`${activeVideo.id}-${activeVideo.videoIds?.[lang] ?? activeVideo.youtubeId}`}
                videoId={activeVideo.videoIds?.[lang] ?? activeVideo.youtubeId}
                lang={lang}
                translate={!activeVideo.videoIds?.[lang]}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cards Grid */}
      {loading ? (
        <div className="glow-card p-12 text-center">
          <p className="text-muted-foreground">Loading tutorials...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="glow-card p-12 text-center">
          <p className="text-muted-foreground italic">No tutorials available.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((tutorial, i) => {
            const isPlaying = activeVideo?.id === tutorial.id;
            const meta = DEFAULT_METADATA[tutorial.youtubeId] || {
              category: { en: "Business Growth", hi: "व्यापार वृद्धि", ta: "வணிக வளர்ச்சி", te: "వ్యాపార వృద్ధి", gu: "વ્યવસાય વૃદ્ધિ", es: "Crecimiento Empresarial" },
              duration: "Video",
              icon: BookOpen
            };
            const Icon = meta.icon;
            const catKey = meta.category["en"];
            const isAnalystAdded = !tutorial.id.startsWith("default-");

            return (
              <motion.div key={tutorial.id}
                className={cn("glow-card overflow-hidden cursor-pointer group transition-all hover:border-primary/40",
                  isPlaying && "border-primary/60 ring-1 ring-primary/30",
                  isAnalystAdded && "border-purple-500/20 hover:border-purple-500/40"
                )}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => setActiveVideo(tutorial)}>
                <div className="relative w-full bg-accent/30 overflow-hidden" style={{ paddingBottom: "56.25%" }}>
                  <img src={`https://img.youtube.com/vi/${tutorial.youtubeId}/hqdefault.jpg`}
                    alt={getLocalizedText(tutorial.title, lang)}
                    className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg shadow-primary/30">
                      <Play className="h-6 w-6 text-primary-foreground ml-1" fill="currentColor" />
                    </div>
                  </div>
                  <div className="absolute bottom-2 right-2 bg-black/80 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                    {meta.duration}
                  </div>
                  {isPlaying && (
                    <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
                      {ui.playing}
                    </div>
                  )}
                  {isAnalystAdded && (
                    <div className="absolute top-2 right-2 bg-purple-500/80 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                      Analyst Pick
                    </div>
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-2 group-hover:text-primary transition-colors">
                        {getLocalizedText(tutorial.title, lang)}
                      </h3>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                        {getLocalizedText(tutorial.description, lang)}
                      </p>
                    </div>
                  </div>
                  {tutorial.videoIds && Object.keys(tutorial.videoIds).length > 0 && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <Globe className="h-3 w-3 shrink-0" />
                      <span>
                        Also in{" "}
                        {languages
                          .filter((l) => tutorial.videoIds?.[l.code])
                          .map((l) => l.label)
                          .join(", ")}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className={cn("text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                      categoryColors[catKey] || "bg-accent text-muted-foreground border-border")}>
                      {getLocalizedText(meta.category, lang)}
                    </span>
                    <span className="text-[10px] text-muted-foreground font-medium flex items-center gap-1">
                      {tutorial.targetRole === "owner" ? "👔 Owner" : tutorial.targetRole === "manager" ? "🤝 Manager" : "👔🤝 Both"}
                    </span>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
