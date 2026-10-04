import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { PlusCircle, Trash2, Play, Youtube, BookOpen, Users, TrendingUp, Pencil, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  fetchTutorials,
  createTutorial,
  updateTutorial,
  deleteTutorial,
  type Tutorial,
} from "@/lib/api";
import { useRealtime } from "@/lib/socket";

type TargetRole = "owner" | "manager" | "both";

function extractYoutubeId(input: string): string | null {
  // Accept full URL or bare ID
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = input.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function getLocalizedText(text: string | null | undefined, lang: string = "en"): string {
  if (!text) return "";
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
}

// Languages that can carry a dedicated translated video (English is the main field).
const VIDEO_LANGUAGES: { code: string; label: string }[] = [
  { code: "hi", label: "Hindi" },
  { code: "ta", label: "Tamil" },
  { code: "te", label: "Telugu" },
  { code: "gu", label: "Gujarati" },
  { code: "es", label: "Spanish" },
];

const emptyForm = {
  title: "",
  description: "",
  youtubeUrl: "",
  targetRole: "both" as TargetRole,
  langUrls: {} as Record<string, string>,
};

export default function AnalystTutorials() {
  const [videos, setVideos] = useState<Tutorial[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeVideo, setActiveVideo] = useState<Tutorial | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadVideos = useCallback(async () => {
    try {
      const data = await fetchTutorials();
      setVideos(data);
    } catch {
      toast.error("Failed to load tutorials");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // Live refresh when tutorials change (e.g. another analyst session).
  useRealtime("tutorials", loadVideos);

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId(null);
    setAdding(false);
  };

  const startEdit = (video: Tutorial) => {
    setForm({
      title: getLocalizedText(video.title),
      description: getLocalizedText(video.description) || "",
      youtubeUrl: video.youtubeId,
      targetRole: video.targetRole,
      langUrls: { ...(video.videoIds ?? {}) },
    });
    setEditingId(video.id);
    setAdding(true);
    // Bring the form into view.
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.youtubeUrl.trim()) {
      toast.error("Title and YouTube URL are required");
      return;
    }

    const youtubeId = extractYoutubeId(form.youtubeUrl.trim());
    if (!youtubeId) {
      toast.error("Invalid YouTube URL or video ID");
      return;
    }

    // Build the per-language video map from the optional language fields.
    const videoIds: Record<string, string> = {};
    for (const { code, label } of VIDEO_LANGUAGES) {
      const raw = (form.langUrls[code] || "").trim();
      if (!raw) continue;
      const id = extractYoutubeId(raw);
      if (!id) {
        toast.error(`Invalid YouTube link for ${label}`);
        return;
      }
      videoIds[code] = id;
    }

    setSaving(true);
    try {
      if (editingId) {
        await updateTutorial(editingId, {
          title: form.title.trim(),
          description: form.description.trim(),
          youtubeId,
          targetRole: form.targetRole,
          videoIds,
        });
        toast.success("Tutorial updated");
      } else {
        await createTutorial({
          title: form.title.trim(),
          description: form.description.trim(),
          youtubeId,
          targetRole: form.targetRole,
          videoIds,
        });
        toast.success(
          `Tutorial added for ${form.targetRole === "both" ? "Owner & Manager" : form.targetRole}`
        );
      }
      resetForm();
      await loadVideos();
    } catch {
      toast.error(editingId ? "Failed to update tutorial" : "Failed to add tutorial");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteTutorial(id);
      if (activeVideo?.id === id) setActiveVideo(null);
      if (editingId === id) resetForm();
      setVideos((prev) => prev.filter((v) => v.id !== id));
      toast.info("Tutorial removed");
    } catch {
      toast.error("Failed to remove tutorial");
    }
  };

  const roleLabel = (role: TargetRole) => {
    if (role === "owner") return { label: "👔 Owner", color: "bg-primary/10 text-primary border-primary/20" };
    if (role === "manager") return { label: "🤝 Manager", color: "bg-orange-500/10 text-orange-400 border-orange-500/20" };
    return { label: "👔🤝 Both", color: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-bold text-foreground flex items-center gap-2">
            <Youtube className="h-6 w-6 text-primary" />
            Manage Tutorial Videos
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Add, edit, or remove YouTube tutorials for Business Owner and Shop Manager
          </p>
        </div>
        <Button
          onClick={() => (adding ? resetForm() : setAdding(true))}
          className="gap-2 self-start"
        >
          <PlusCircle className="h-4 w-4" />
          {adding ? "Cancel" : "Add Tutorial"}
        </Button>
      </div>

      {/* Info banner */}
      <div className="flex items-center gap-3 rounded-lg bg-primary/10 border border-primary/20 p-4">
        <BookOpen className="h-5 w-5 text-primary shrink-0" />
        <p className="text-sm text-primary">
          Videos you add here will appear in the <strong>Tutorials</strong> page for the selected role.
          Paste any YouTube URL or video ID.
        </p>
      </div>

      {/* Add / Edit Form */}
      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="glow-card p-5 space-y-4"
          >
            <h3 className="font-semibold text-foreground">
              {editingId ? "Edit Tutorial" : "Add New Tutorial"}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Video Title *
                </label>
                <Input
                  placeholder="e.g. How to Increase Sales in 2024"
                  value={form.title}
                  onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  YouTube URL or Video ID *
                </label>
                <Input
                  placeholder="https://youtube.com/watch?v=... or video ID"
                  value={form.youtubeUrl}
                  onChange={e => setForm(f => ({ ...f, youtubeUrl: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Description
              </label>
              <Input
                placeholder="Brief description of what this tutorial covers..."
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Show this video to
              </label>
              <div className="flex gap-2 flex-wrap">
                {([
                  { value: "owner",   label: "👔 Owner Only",        icon: TrendingUp },
                  { value: "manager", label: "🤝 Manager Only",       icon: Users },
                  { value: "both",    label: "👔🤝 Both Roles",       icon: Play },
                ] as const).map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setForm(f => ({ ...f, targetRole: opt.value }))}
                    className={cn(
                      "px-4 py-2 rounded-lg text-sm font-medium border transition-colors",
                      form.targetRole === opt.value
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-accent/50 text-muted-foreground border-border hover:text-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Translated versions (optional)
              </label>
              <p className="text-[11px] text-muted-foreground">
                Paste a YouTube link/ID of this same video in another language. Viewers who
                pick that language will watch this version instead of auto-translated subtitles.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                {VIDEO_LANGUAGES.map((l) => (
                  <div key={l.code} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-16 shrink-0">{l.label}</span>
                    <Input
                      placeholder="YouTube URL or ID"
                      value={form.langUrls[l.code] || ""}
                      onChange={e =>
                        setForm(f => ({
                          ...f,
                          langUrls: { ...f.langUrls, [l.code]: e.target.value },
                        }))
                      }
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {saving ? "Saving..." : editingId ? "Save Changes" : "Add Tutorial"}
              </Button>
              <Button variant="outline" onClick={resetForm}>Cancel</Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video Player */}
      <AnimatePresence>
        {activeVideo && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="glow-card overflow-hidden"
          >
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground">{getLocalizedText(activeVideo.title)}</h3>
                <p className="text-xs text-muted-foreground mt-0.5">{getLocalizedText(activeVideo.description)}</p>
              </div>
              <button
                onClick={() => setActiveVideo(null)}
                className="text-xs px-3 py-1 rounded-md bg-accent hover:bg-accent/80 text-muted-foreground ml-4 shrink-0"
              >
                Close
              </button>
            </div>
            <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
              <iframe
                className="absolute inset-0 w-full h-full"
                src={`https://www.youtube.com/embed/${activeVideo.youtubeId}?autoplay=1&rel=0`}
                title={getLocalizedText(activeVideo.title)}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Video List */}
      {loading ? (
        <div className="glow-card p-12 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
        </div>
      ) : videos.length === 0 ? (
        <div className="glow-card p-12 text-center">
          <Youtube className="h-12 w-12 text-muted-foreground mx-auto mb-4 opacity-20" />
          <p className="text-muted-foreground italic">No tutorials added yet. Click "Add Tutorial" to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <AnimatePresence>
            {videos.map((video, i) => {
              const role = roleLabel(video.targetRole);
              const isPlaying = activeVideo?.id === video.id;
              const isEditing = editingId === video.id;
              return (
                <motion.div
                  key={video.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.05 }}
                  className={cn(
                    "glow-card overflow-hidden group",
                    isPlaying && "border-primary/60 ring-1 ring-primary/30",
                    isEditing && "border-amber-500/60 ring-1 ring-amber-500/30"
                  )}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative w-full bg-accent/30 overflow-hidden cursor-pointer"
                    style={{ paddingBottom: "56.25%" }}
                    onClick={() => setActiveVideo(video)}
                  >
                    <img
                      src={`https://img.youtube.com/vi/${video.youtubeId}/hqdefault.jpg`}
                      alt={getLocalizedText(video.title)}
                      className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <div className="h-14 w-14 rounded-full bg-primary/90 flex items-center justify-center shadow-lg">
                        <Play className="h-6 w-6 text-primary-foreground ml-1" fill="currentColor" />
                      </div>
                    </div>
                    {isPlaying && (
                      <div className="absolute top-2 left-2 bg-primary text-primary-foreground text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-primary-foreground animate-pulse" />
                        Playing
                      </div>
                    )}
                    {isEditing && (
                      <div className="absolute top-2 right-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded">
                        Editing
                      </div>
                    )}
                  </div>

                  {/* Card content */}
                  <div className="p-4 space-y-3">
                    <div>
                      <h3
                        className="text-sm font-semibold text-foreground line-clamp-2 cursor-pointer hover:text-primary transition-colors"
                        onClick={() => setActiveVideo(video)}
                      >
                        {getLocalizedText(video.title)}
                      </h3>
                      {video.description && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{getLocalizedText(video.description)}</p>
                      )}
                    </div>

                    <div className="flex items-center justify-between">
                      <span className={cn(
                        "text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border",
                        role.color
                      )}>
                        {role.label}
                      </span>
                      {video.addedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(video.addedAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => startEdit(video)}
                        className="flex-1 gap-1.5 border-border text-muted-foreground hover:text-foreground hover:bg-accent"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDelete(video.id)}
                        className="flex-1 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </Button>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
