import Hls from "hls.js";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { SubtitleTrack } from "@onyxchin/shared";
import { clamp, formatTime, percentOf, serverMeta } from "../lib/format";
import { readVolume, writeVolume } from "../lib/prefs";
import { toVtt } from "../lib/subtitles";
import { Icon } from "./Icon";
import { Poster } from "./Poster";

export interface PlayerProps {
  url: string;
  kind: "hls" | "direct";
  title: string;
  poster?: string | null;
  serverLabel: string;
  quality?: string;
  startAt?: number;
  subtitles: SubtitleTrack[];
  onProgress: (position: number, duration: number) => void;
  onEnded?: () => void;
  onNext?: (() => void) | null;
  nextLabel?: string | null;
}

const RATES = [0.75, 1, 1.25, 1.5, 2];

export function Player({
  url,
  kind,
  title,
  poster,
  serverLabel,
  quality,
  startAt = 0,
  subtitles,
  onProgress,
  onEnded,
  onNext,
  nextLabel,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastReport = useRef(0);
  const lastKnown = useRef({ position: startAt, duration: 0 });
  const startApplied = useRef(false);
  const dragging = useRef(false);
  const progressRef = useRef(onProgress);
  progressRef.current = onProgress;

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(() => readVolume());
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [waiting, setWaiting] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [pip, setPip] = useState(false);
  const [subIndex, setSubIndex] = useState(-1);
  const [trackSrc, setTrackSrc] = useState<{
    src: string;
    label: string;
    lang: string;
  } | null>(null);
  const [subNotice, setSubNotice] = useState<string | null>(null);
  const [resumedFrom, setResumedFrom] = useState<number | null>(null);

  const pipSupported =
    typeof document !== "undefined" && Boolean(document.pictureInPictureEnabled);

  /* ---------- media attachment ---------- */

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setError(null);
    setWaiting(true);
    setBuffered(0);
    setDuration(0);
    setCurrent(0);
    startApplied.current = false;
    lastKnown.current = { position: startAt, duration: 0 };
    setResumedFrom(null);

    let hls: Hls | null = null;
    let retries = 0;

    if (kind === "hls") {
      const nativeHls = video.canPlayType("application/vnd.apple.mpegurl") !== "";
      if (nativeHls) {
        video.src = url;
      } else if (Hls.isSupported()) {
        hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          maxBufferLength: 30,
          backBufferLength: 30,
        });
        hls.on(Hls.Events.ERROR, (_event, data) => {
          if (!data.fatal) return;
          if (retries < 2 && data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            retries += 1;
            hls?.recoverMediaError();
            return;
          }
          if (retries < 2 && data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            retries += 1;
            hls?.startLoad();
            return;
          }
          setError("Stream HLS gagal dimuat dari server ini.");
          setWaiting(false);
        });
        hls.loadSource(url);
        hls.attachMedia(video);
      } else {
        setError("Browser ini tidak mendukung pemutaran HLS.");
        setWaiting(false);
      }
    } else {
      video.src = url;
    }

    return () => {
      hls?.destroy();
      if (!video.paused) video.pause();
      video.removeAttribute("src");
    };
  }, [url, kind, startAt]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = volume;
    video.muted = muted;
  }, [volume, muted]);

  useEffect(() => {
    writeVolume(volume);
    const video = videoRef.current;
    if (video) video.playbackRate = rate;
  }, [volume, rate]);

  /* ---------- fullscreen + PiP ---------- */

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const enter = () => setPip(true);
    const leave = () => setPip(false);
    video.addEventListener("enterpictureinpicture", enter);
    video.addEventListener("leavepictureinpicture", leave);
    return () => {
      video.removeEventListener("enterpictureinpicture", enter);
      video.removeEventListener("leavepictureinpicture", leave);
    };
  }, []);

  /* ---------- controls visibility ---------- */

  const scheduleHide = useCallback(() => {
    setControlsVisible(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    const video = videoRef.current;
    if (!video || video.paused || video.ended) return;
    hideTimer.current = window.setTimeout(() => setControlsVisible(false), 2600);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onPlay = () => scheduleHide();
    const onPause = () => {
      setControlsVisible(true);
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    };
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    return () => {
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
    };
  }, [scheduleHide]);

  useEffect(
    () => () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
    },
    [],
  );

  /* ---------- progress flush ---------- */

  useEffect(
    () => () => {
      const { position, duration: total } = lastKnown.current;
      if (total > 0) progressRef.current(position, total);
    },
    [],
  );

  useEffect(() => {
    if (resumedFrom == null) return;
    const timer = window.setTimeout(() => setResumedFrom(null), 5000);
    return () => window.clearTimeout(timer);
  }, [resumedFrom]);

  /* ---------- subtitles ---------- */

  useEffect(() => {
    setTrackSrc(null);
    setSubNotice(null);
    if (subIndex < 0) return;
    const track = subtitles[subIndex];
    if (!track) return;
    /*
     * Text tracks are always fetched and attached as blob URLs: Chromium
     * silently yields zero cues for cross-origin <track src> responses even
     * with a permissive CORS header, while the same bytes as a blob parse.
     */
    let cancelled = false;
    let objectUrl: string | null = null;
    fetch(track.url)
      .then((response) => (response.ok ? response.text() : Promise.reject(new Error("sub"))))
      .then((text) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(new Blob([toVtt(text)], { type: "text/vtt" }));
        setTrackSrc({
          src: objectUrl,
          label: track.label,
          lang: track.lang || "id",
        });
      })
      .catch(() => {
        if (!cancelled) setSubNotice("Subtitle tidak bisa dimuat untuk episode ini.");
      });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [subIndex, subtitles]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const tracks = video.textTracks;
    for (let index = 0; index < tracks.length; index += 1) {
      const entry = tracks[index];
      const active =
        trackSrc != null &&
        entry.label === trackSrc.label &&
        entry.language.toLowerCase() === trackSrc.lang.toLowerCase();
      entry.mode = active ? "showing" : "disabled";
    }
  }, [trackSrc]);

  /* ---------- playback actions ---------- */

  const togglePlay = async () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      try {
        await video.play();
      } catch {
        /* Autoplay refusal leaves the poster + play button in place. */
      }
    } else {
      video.pause();
    }
  };

  const seekBy = (delta: number) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    video.currentTime = clamp(video.currentTime + delta, 0, video.duration);
    setCurrent(video.currentTime);
  };

  const changeVolume = (delta: number) => {
    const next = clamp(volume + delta, 0, 1);
    setVolume(next);
    if (next > 0) setMuted(false);
  };

  const toggleFullscreen = async () => {
    const stage = stageRef.current;
    const video = videoRef.current;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      if (stage?.requestFullscreen) {
        await stage.requestFullscreen();
        return;
      }
      const legacy = video as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
      legacy?.webkitEnterFullscreen?.();
    } catch {
      /* Fullscreen can be blocked by the embedding context. */
    }
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else {
        await video.requestPictureInPicture();
      }
    } catch {
      /* PiP unavailable for this stream. */
    }
  };

  const seekToPointer = (clientX: number, element: HTMLElement) => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(video.duration)) return;
    const rect = element.getBoundingClientRect();
    const ratio = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
    video.currentTime = ratio * video.duration;
    setCurrent(video.currentTime);
  };

  const onSeekPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragging.current = true;
    seekToPointer(event.clientX, event.currentTarget);
  };

  const onSeekPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging.current) return;
    seekToPointer(event.clientX, event.currentTarget);
  };

  const onSeekPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragging.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const onSeekKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video) return;
    if (event.key === "ArrowRight") {
      event.preventDefault();
      seekBy(5);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      seekBy(-5);
    } else if (event.key === "Home") {
      event.preventDefault();
      video.currentTime = 0;
    } else if (event.key === "End") {
      event.preventDefault();
      video.currentTime = Math.max(0, video.duration - 0.5);
    }
  };

  /* ---------- media events ---------- */

  const applyStart = () => {
    const video = videoRef.current;
    if (!video || startApplied.current) return;
    startApplied.current = true;
    if (
      startAt > 5 &&
      Number.isFinite(video.duration) &&
      startAt < video.duration - 10
    ) {
      video.currentTime = startAt;
      setResumedFrom(startAt);
    }
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrent(video.currentTime);
    lastKnown.current = { position: video.currentTime, duration: video.duration || 0 };
    if (Date.now() - lastReport.current > 4000) {
      lastReport.current = Date.now();
      progressRef.current(video.currentTime, video.duration || 0);
    }
  };

  const handleSeeked = () => {
    const video = videoRef.current;
    if (!video) return;
    setCurrent(video.currentTime);
    lastKnown.current = { position: video.currentTime, duration: video.duration || 0 };
    /* A seek is a deliberate position change: persist it immediately. */
    lastReport.current = Date.now();
    progressRef.current(video.currentTime, video.duration || 0);
  };

  const handleProgress = () => {
    const video = videoRef.current;
    if (!video) return;
    const ranges = video.buffered;
    setBuffered(ranges.length ? ranges.end(ranges.length - 1) : 0);
  };

  const onStageKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    /* Only act when the stage itself is focused; controls own their keys. */
    if (event.target !== event.currentTarget) return;
    const video = videoRef.current;
    if (!video) return;
    switch (event.key) {
      case " ":
      case "k":
      case "K":
        event.preventDefault();
        void togglePlay();
        break;
      case "ArrowRight":
        event.preventDefault();
        seekBy(5);
        break;
      case "ArrowLeft":
        event.preventDefault();
        seekBy(-5);
        break;
      case "ArrowUp":
        event.preventDefault();
        changeVolume(0.05);
        break;
      case "ArrowDown":
        event.preventDefault();
        changeVolume(-0.05);
        break;
      case "m":
      case "M":
        event.preventDefault();
        setMuted((value) => !value);
        break;
      case "f":
      case "F":
        event.preventDefault();
        void toggleFullscreen();
        break;
      case "n":
      case "N":
        if (onNext) {
          event.preventDefault();
          onNext();
        }
        break;
      default:
        break;
    }
  };

  /* ---------- render ---------- */

  const playedPercent = percentOf(current, duration);
  const bufferedPercent = percentOf(buffered, duration);
  const showPoster = Boolean(poster) && current < 0.5 && !playing;
  const meta = serverMeta(serverLabel, quality);

  return (
    <div
      className="stage"
      ref={stageRef}
      data-controls={controlsVisible ? "true" : "false"}
      data-playing={playing ? "true" : "false"}
      tabIndex={0}
      role="region"
      aria-label={`Pemutar video — ${title}`}
      onPointerMove={scheduleHide}
      onPointerLeave={() => {
        if (playing) setControlsVisible(false);
      }}
      onFocus={() => setControlsVisible(true)}
      onKeyDown={onStageKeyDown}
    >
      <video
        ref={videoRef}
        className="stage__video"
        playsInline
        preload="metadata"
        onClick={() => {
          void togglePlay();
        }}
        onDoubleClick={() => {
          void toggleFullscreen();
        }}
        onPlay={() => {
          setPlaying(true);
          setWaiting(false);
        }}
        onPause={() => setPlaying(false)}
        onTimeUpdate={handleTimeUpdate}
        onSeeked={handleSeeked}
        onProgress={handleProgress}
        onDurationChange={() => {
          const video = videoRef.current;
          if (video) setDuration(video.duration || 0);
        }}
        onLoadedMetadata={() => {
          const video = videoRef.current;
          if (video) setDuration(video.duration || 0);
          setWaiting(false);
          applyStart();
        }}
        onWaiting={() => setWaiting(true)}
        onPlaying={() => setWaiting(false)}
        onCanPlay={() => setWaiting(false)}
        onEnded={() => {
          setPlaying(false);
          const video = videoRef.current;
          if (video && video.duration) progressRef.current(video.duration, video.duration);
          onEnded?.();
        }}
        onError={() => {
          const video = videoRef.current;
          if (!video || !video.error) return;
          setError("Video tidak bisa diputar dari server ini.");
          setWaiting(false);
        }}
      >
        {trackSrc ? (
          <track
            key={trackSrc.src}
            kind="subtitles"
            label={trackSrc.label}
            srcLang={trackSrc.lang}
            src={trackSrc.src}
            default
          />
        ) : null}
      </video>

      {showPoster ? (
        <div className="stage__poster" aria-hidden="true">
          <Poster src={poster ?? null} title={title} priority />
        </div>
      ) : null}

      {waiting && !error ? <span className="stage__spinner" aria-hidden="true" /> : null}

      {resumedFrom != null ? (
        <p className="stage__pill mono">Dilanjutkan dari {formatTime(resumedFrom)}</p>
      ) : null}

      {!playing && !error ? (
        <button
          type="button"
          className="stage__center"
          onClick={() => {
            void togglePlay();
          }}
          aria-label={current > 0 ? "Lanjutkan pemutaran" : "Putar"}
        >
          <span className="stage__center-ring">
            <Icon name="play" size={26} />
          </span>
          <span className="mono">{current > 0 ? "Lanjutkan" : "Putar"}</span>
        </button>
      ) : null}

      {error ? (
        <div className="stage__error" role="alert">
          <p className="mono mono--gold">Gangguan pemutaran</p>
          <p className="stage__error-msg">{error}</p>
          <div className="stage__error-actions">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => {
                const video = videoRef.current;
                setError(null);
                if (!video) return;
                video.load();
                void video.play().catch(() => undefined);
              }}
            >
              Muat ulang
            </button>
            <a className="btn btn--quiet btn--sm" href={url} target="_blank" rel="noreferrer">
              Buka langsung
              <Icon name="external" size={13} />
            </a>
          </div>
        </div>
      ) : null}

      <div className="controls">
        <div className="controls__seek">
          <div
            className="seek"
            role="slider"
            tabIndex={0}
            aria-label="Waktu putar"
            aria-valuemin={0}
            aria-valuemax={Math.round(duration)}
            aria-valuenow={Math.round(current)}
            aria-valuetext={`${formatTime(current)} dari ${formatTime(duration)}`}
            onPointerDown={onSeekPointerDown}
            onPointerMove={onSeekPointerMove}
            onPointerUp={onSeekPointerUp}
            onPointerCancel={onSeekPointerUp}
            onKeyDown={onSeekKeyDown}
          >
            <span className="seek__track">
              <span className="seek__buffer" style={{ width: `${bufferedPercent}%` }} />
              <span className="seek__fill" style={{ width: `${playedPercent}%` }} />
              <span className="seek__thumb" style={{ left: `${playedPercent}%` }} />
            </span>
          </div>
          <div className="controls__time mono">
            <span>{formatTime(current)}</span>
            <span className="controls__sep">/</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        <div className="controls__bar">
          <div className="controls__group">
            <button
              type="button"
              className="ctl"
              onClick={() => {
                void togglePlay();
              }}
              aria-label={playing ? "Jeda" : "Putar"}
            >
              <Icon name={playing ? "pause" : "play"} size={18} />
            </button>
            <div className="controls__volume">
              <button
                type="button"
                className="ctl"
                onClick={() => setMuted((value) => !value)}
                aria-label={muted || volume === 0 ? "Nyalakan suara" : "Bisukan"}
              >
                <Icon name={muted || volume === 0 ? "mute" : "volume"} size={17} />
              </button>
              <input
                className="controls__range"
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={muted ? 0 : volume}
                onChange={(event) => setVolume(Number(event.target.value))}
                aria-label="Volume"
              />
            </div>
            <span className="controls__meta mono">{meta}</span>
          </div>

          <div className="controls__group">
            {subtitles.length > 0 ? (
              <label className="controls__select-wrap">
                <Icon name="subtitles" size={15} />
                <span className="sr-only">Subtitle</span>
                <select
                  className="controls__select"
                  value={subIndex}
                  onChange={(event) => setSubIndex(Number(event.target.value))}
                  aria-label="Subtitle"
                >
                  <option value={-1}>Sub off</option>
                  {subtitles.map((track, index) => (
                    <option key={`${track.lang}-${index}`} value={index}>
                      {track.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="controls__select-wrap">
              <span className="sr-only">Kecepatan putar</span>
              <select
                className="controls__select controls__select--rate"
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
                aria-label="Kecepatan putar"
              >
                {RATES.map((value) => (
                  <option key={value} value={value}>
                    {value}×
                  </option>
                ))}
              </select>
            </label>
            {pipSupported ? (
              <button
                type="button"
                className="ctl"
                onClick={() => {
                  void togglePip();
                }}
                aria-pressed={pip}
                aria-label="Picture in picture"
              >
                <Icon name="pip" size={17} />
              </button>
            ) : null}
            {onNext ? (
              <button
                type="button"
                className="ctl"
                onClick={onNext}
                aria-label={nextLabel ? `Episode berikutnya: ${nextLabel}` : "Episode berikutnya"}
                title={nextLabel ? `Berikutnya: ${nextLabel}` : "Episode berikutnya"}
              >
                <Icon name="next" size={16} />
              </button>
            ) : null}
            <button
              type="button"
              className="ctl"
              onClick={() => {
                void toggleFullscreen();
              }}
              aria-label={fullscreen ? "Keluar layar penuh" : "Layar penuh"}
            >
              <Icon name={fullscreen ? "fullscreenExit" : "fullscreen"} size={17} />
            </button>
          </div>
        </div>

        {subNotice ? <p className="controls__notice mono">{subNotice}</p> : null}
      </div>
    </div>
  );
}
