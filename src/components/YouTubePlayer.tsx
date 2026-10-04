/**
 * YouTube player that actually honours a selected language.
 *
 * A plain <iframe> with cc_lang_pref only sets a *preference* — captions often
 * stay off until the user clicks CC. Using the IFrame Player API we can force
 * the caption module on and switch its track to the selected language (YouTube
 * auto-translates), so picking e.g. Telugu shows Telugu subtitles immediately.
 *
 * Note: this translates *subtitles*. The original audio track is unchanged —
 * true dubbed audio would require a separate video per language.
 */
import { useEffect, useRef } from "react";

// Minimal slice of the IFrame Player API surface that we use.
type YTPlayer = {
  destroy?: () => void;
  loadModule: (module: string) => void;
  setOption: (module: string, option: string, value: unknown) => void;
};

type YTPlayerEvent = { target: YTPlayer };

type YTPlayerConfig = {
  width?: string;
  height?: string;
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: {
    onReady?: (e: YTPlayerEvent) => void;
    onApiChange?: (e: YTPlayerEvent) => void;
  };
};

type YTNamespace = {
  Player: new (el: HTMLElement, config: YTPlayerConfig) => YTPlayer;
};

type YTWindow = Window & {
  YT?: YTNamespace;
  onYouTubeIframeAPIReady?: () => void;
};

// The IFrame API script is global and loads once; share a single promise.
let apiPromise: Promise<void> | null = null;

function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve) => {
    const w = window as YTWindow;
    if (w.YT && w.YT.Player) {
      resolve();
      return;
    }
    const previous = w.onYouTubeIframeAPIReady;
    w.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const tag = document.createElement("script");
    tag.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(tag);
  });
  return apiPromise;
}

/** Force captions on and translate them to `lang` (raw track for English). */
function applyCaptionLanguage(player: YTPlayer, lang: string) {
  // The HTML5 player uses the "captions" module; older players use "cc".
  for (const mod of ["captions", "cc"]) {
    try {
      player.loadModule(mod);
      player.setOption(mod, "reload", true);
      player.setOption(
        mod,
        "track",
        lang === "en" ? {} : { translationLanguage: lang }
      );
    } catch {
      // Module not available for this video — ignore and try the other.
    }
  }
}

export function YouTubePlayer({
  videoId,
  lang,
  translate = true,
}: {
  videoId: string;
  lang: string;
  /** Auto-translate subtitles into `lang`. Off when the video is already
   *  in that language (a dedicated translated video is playing). */
  translate?: boolean;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);

  // Build (or rebuild) the player whenever the video changes.
  useEffect(() => {
    let cancelled = false;
    loadYouTubeApi().then(() => {
      if (cancelled || !hostRef.current) return;
      const YT = (window as YTWindow).YT;
      if (!YT) return;

      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }

      // The API replaces this element with the player iframe.
      const mount = document.createElement("div");
      hostRef.current.innerHTML = "";
      hostRef.current.appendChild(mount);

      playerRef.current = new YT.Player(mount, {
        width: "100%",
        height: "100%",
        videoId,
        playerVars: {
          autoplay: 1,
          rel: 0,
          hl: lang,
          cc_load_policy: 1,
          cc_lang_pref: lang,
          modestbranding: 1,
        },
        events: {
          onReady: (e) => translate && applyCaptionLanguage(e.target, lang),
          // Fires once caption modules are available — reapply then.
          onApiChange: (e) => translate && applyCaptionLanguage(e.target, lang),
        },
      });
    });

    return () => {
      cancelled = true;
      if (playerRef.current?.destroy) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoId]);

  // Switch caption language live when the user changes it (same video).
  useEffect(() => {
    if (playerRef.current && translate) applyCaptionLanguage(playerRef.current, lang);
  }, [lang, translate]);

  return <div ref={hostRef} className="absolute inset-0 w-full h-full" />;
}
