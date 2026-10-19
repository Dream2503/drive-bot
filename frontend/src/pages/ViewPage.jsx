import {useCallback, useEffect, useRef, useState} from "react";
import {useNavigate, useParams, useSearchParams} from "react-router-dom";
import Hls from "hls.js"; // npm i hls.js

const API_URL = window.STORELIMITLESS_CONFIG?.API_URL ?? import.meta.env.VITE_API_URL;

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

const ctrlBtn =
    "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[#fafafa]/90 transition-colors " +
    "hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#3ecf8e]";

const fmtTime = (s) => {
    if (!Number.isFinite(s) || s < 0) return "0:00";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, "0");
    return h > 0 ? `${h}:${m.toString().padStart(2, "0")}:${sec}` : `${m}:${sec}`;
};

const langName = (code) => {
    if (!code) return "";
    try {
        return new Intl.DisplayNames(undefined, {type: "language"}).of(code) || code;
    } catch {
        return code;
    }
};

// t = {name, lang}
const GENERIC_NAME = /^(audio|subtitles?|subs?|track)[ _-]?\d*$/i;
const trackLabel = (t, i) => {
    const custom =
        t.name && !GENERIC_NAME.test(t.name) && t.name.toLowerCase() !== (t.lang || "").toLowerCase() ? t.name : "";
    return custom || langName(t.lang) || t.name || `Track ${i + 1}`;
};
const trackDetail = (t) => {
    const lang = langName(t.lang);
    return lang && trackLabel(t, 0) !== lang ? lang : "";
};

/** Parses .srt and .vtt text into [{start, end, text}] (seconds). */
function parseSubs(raw) {
    const text = raw.replace(/^\uFEFF/, "").replace(/\r/g, "");
    const re = /(\d{1,2}:)?(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[,.](\d{1,3})/;
    const toSec = (h, m, s, ms) =>
        (h ? parseInt(h, 10) : 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000;

    const cues = [];
    for (const block of text.split(/\n\n+/)) {
        const lines = block.split("\n");
        const idx = lines.findIndex((l) => l.includes("-->"));
        if (idx < 0) continue;
        const m = lines[idx].match(re);
        if (!m) continue;
        const body = lines
            .slice(idx + 1)
            .join("\n")
            .replace(/<[^>]+>/g, "")
            .replace(/\{\\[^}]*\}/g, "")
            .trim();
        if (!body) continue;
        cues.push({
            start: toSec(m[1], m[2], m[3], m[4]),
            end: toSec(m[5], m[6], m[7], m[8]),
            text: body,
        });
    }
    return cues;
}

function MenuRow({active, onClick, label, detail}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[#fafafa] hover:bg-white/10"
        >
            <span className="material-symbols-outlined inline-block w-4 text-[16px] text-[#3ecf8e]" aria-hidden="true">
                {active ? "check" : ""}
            </span>
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {detail && <span className="text-[11px] text-[#8b8b8b]">{detail}</span>}
        </button>
    );
}

const MenuHeading = ({children}) => (
    <p className="px-2 pb-1 pt-2 text-[11px] text-[#8b8b8b]">{children}</p>
);

/* ------------------------------------------------------------------ */
/* video player                                                        */
/* ------------------------------------------------------------------ */

/**
 * Props
 *  - streamUrl : direct file URL (mp4/webm/…); used when no hlsUrl is given
 *  - hlsUrl    : optional .m3u8 master playlist. Required for selectable
 *                audio / subtitle tracks on MKV and similar files.
 *  - subtitles : optional [{label, src}] sidecar .srt / .vtt files
 */
function VideoPlayer({file, streamUrl, hlsUrl, subtitles = [], heightClass = "h-[70vh]"}) {
    const wrapRef = useRef(null);
    const videoRef = useRef(null);
    const hlsRef = useRef(null);
    const hideTimer = useRef(null);
    const fileInputRef = useRef(null);
    const menuRef = useRef(null);
    const subRef = useRef({cues: null, delay: 0});

    const [playing, setPlaying] = useState(false);
    const [buffering, setBuffering] = useState(true);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [buffered, setBuffered] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const [rate, setRate] = useState(1);
    const [isFs, setIsFs] = useState(false);
    const [showUi, setShowUi] = useState(true);
    const [menu, setMenu] = useState(null); // null | "audio" | "subs" | "speed"
    const [error, setError] = useState(null);
    const [notice, setNotice] = useState(null);

    const [audioTracks, setAudioTracks] = useState([]); // [{id,label,detail}]
    const [activeAudio, setActiveAudio] = useState(0);
    const [embeddedSubs, setEmbeddedSubs] = useState([]); // [{id,label,detail}]
    const [activeSub, setActiveSub] = useState("off"); // "off" | "emb:<id>" | "ext:<id>"
    const [extSubs, setExtSubs] = useState([]); // [{id,label,cues}]
    const [subDelay, setSubDelay] = useState(0);
    const [cueText, setCueText] = useState("");

    menuRef.current = menu;

    /* ---------- source + track discovery ---------- */
    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        setError(null);
        setBuffering(true);
        setAudioTracks([]);
        setEmbeddedSubs([]);
        setActiveAudio(0);
        setActiveSub((prev) => (prev.startsWith("ext:") ? prev : "off"));

        let hls = null;
        let netRetries = 0;
        const cleanups = [];

        const isSubKind = (t) => t.kind === "subtitles" || t.kind === "captions";

        // hls.js: audio groups + WebVTT subtitle groups from the master playlist
        const syncHls = () => {
            if (!hls) return;
            setAudioTracks(
                hls.audioTracks.map((t, i) => ({
                    id: i,
                    label: trackLabel(t, i),
                    detail: trackDetail(t),
                }))
            );
            setActiveAudio(Math.max(hls.audioTrack, 0));
            setEmbeddedSubs(
                hls.subtitleTracks.map((t, i) => ({
                    id: i,
                    label: trackLabel(t, i),
                    detail: trackDetail(t),
                }))
            );
            setActiveSub((prev) =>
                prev.startsWith("ext:") ? prev : hls.subtitleTrack >= 0 ? `emb:${hls.subtitleTrack}` : "off"
            );
        };

        // Native: video.audioTracks (Safari) and video.textTracks
        const syncNative = () => {
            const aud = video.audioTracks ? Array.from(video.audioTracks) : [];
            setAudioTracks(
                aud.map((t, i) => ({id: i, label: trackLabel({name: t.label, lang: t.language}, i), detail: ""}))
            );
            const on = aud.findIndex((t) => t.enabled);
            setActiveAudio(on < 0 ? 0 : on);

            const txt = Array.from(video.textTracks)
                .map((t, i) => ({t, i}))
                .filter(({t}) => isSubKind(t));
            setEmbeddedSubs(
                txt.map(({t, i}) => ({
                    id: i,
                    label: trackLabel({name: t.label, lang: t.language}, i),
                    detail: "",
                }))
            );
            const showing = txt.find(({t}) => t.mode === "showing");
            setActiveSub((prev) => (prev.startsWith("ext:") ? prev : showing ? `emb:${showing.i}` : "off"));
        };

        const attachNativeListeners = () => {
            ["addtrack", "removetrack", "change"].forEach((ev) => {
                video.audioTracks?.addEventListener?.(ev, syncNative);
                video.textTracks?.addEventListener?.(ev, syncNative);
            });
            video.addEventListener("loadedmetadata", syncNative);
            cleanups.push(() => {
                ["addtrack", "removetrack", "change"].forEach((ev) => {
                    video.audioTracks?.removeEventListener?.(ev, syncNative);
                    video.textTracks?.removeEventListener?.(ev, syncNative);
                });
                video.removeEventListener("loadedmetadata", syncNative);
            });
        };

        if (hlsUrl && Hls.isSupported()) {
            hls = new Hls({enableWebVTT: true, enableCEA708Captions: true});
            hlsRef.current = hls;
            const E = Hls.Events;
            [E.MANIFEST_PARSED, E.AUDIO_TRACKS_UPDATED, E.SUBTITLE_TRACKS_UPDATED, E.AUDIO_TRACK_SWITCHED, E.SUBTITLE_TRACK_SWITCH].forEach(
                (ev) => hls.on(ev, syncHls)
            );
            hls.on(E.ERROR, (_, data) => {
                if (!data.fatal) return;
                if (data.type === Hls.ErrorTypes.NETWORK_ERROR && netRetries++ < 3) hls.startLoad();
                else if (data.type === Hls.ErrorTypes.MEDIA_ERROR && netRetries++ < 3) hls.recoverMediaError();
                else if (streamUrl) {
                    // HLS failed for good: fall back to the plain file (no track switching)
                    hls.destroy();
                    hls = null;
                    hlsRef.current = null;
                    setAudioTracks([]);
                    setEmbeddedSubs([]);
                    video.src = streamUrl;
                    video.play().catch(() => {});
                    attachNativeListeners();
                } else setError("The stream could not be loaded.");
            });
            hls.loadSource(hlsUrl);
            hls.attachMedia(video);
        } else if (hlsUrl && video.canPlayType("application/vnd.apple.mpegurl")) {
            // Safari plays HLS natively and exposes audioTracks / textTracks
            video.src = hlsUrl;
            attachNativeListeners();
        } else {
            video.src = streamUrl;
            attachNativeListeners();
        }

        video.play().catch(() => {});

        return () => {
            cleanups.forEach((fn) => fn());
            if (hls) {
                hls.destroy();
                hlsRef.current = null;
            }
            video.removeAttribute("src");
            video.load();
        };
    }, [streamUrl, hlsUrl]);

    /* ---------- sidecar subtitles passed as props ---------- */
    const subKey = subtitles.map((s) => s.src).join("|");
    useEffect(() => {
        if (!subtitles.length) return;
        let cancelled = false;
        Promise.all(
            subtitles.map(async (s, i) => {
                const res = await fetch(s.src);
                return {id: `p${i}`, label: s.label || `Subtitle ${i + 1}`, cues: parseSubs(await res.text())};
            })
        )
            .then((list) => {
                if (cancelled) return;
                setExtSubs((prev) => [...list, ...prev.filter((p) => !p.id.startsWith("p"))]);
            })
            .catch(() => {});
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [subKey]);

    /* ---------- external subtitle overlay (works with any source) ---------- */
    useEffect(() => {
        const s = extSubs.find((x) => `ext:${x.id}` === activeSub);
        subRef.current = {cues: s ? s.cues : null, delay: subDelay};
        if (!s) setCueText("");
    }, [extSubs, activeSub, subDelay]);

    useEffect(() => {
        let raf;
        let last = "";
        const tick = () => {
            const v = videoRef.current;
            const {cues, delay} = subRef.current;
            let text = "";
            if (v && cues) {
                const t = v.currentTime - delay;
                const cue = cues.find((c) => t >= c.start && t <= c.end);
                text = cue ? cue.text : "";
            }
            if (text !== last) {
                last = text;
                setCueText(text);
            }
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    /* ---------- actions ---------- */
    const togglePlay = useCallback(() => {
        const v = videoRef.current;
        if (!v) return;
        if (v.paused) v.play().catch(() => {});
        else v.pause();
    }, []);

    const seekBy = useCallback((d) => {
        const v = videoRef.current;
        if (!v) return;
        const max = Number.isFinite(v.duration) ? v.duration : Infinity;
        v.currentTime = Math.min(Math.max(v.currentTime + d, 0), max);
    }, []);

    const changeVolume = useCallback((d) => {
        const v = videoRef.current;
        if (!v) return;
        v.volume = Math.min(Math.max(v.volume + d, 0), 1);
        if (v.volume > 0) v.muted = false;
    }, []);

    const toggleFs = useCallback(() => {
        if (document.fullscreenElement) document.exitFullscreen();
        else wrapRef.current?.requestFullscreen?.();
    }, []);

    const togglePip = () => {
        const v = videoRef.current;
        if (!v) return;
        if (document.pictureInPictureElement) document.exitPictureInPicture();
        else v.requestPictureInPicture?.().catch(() => {});
    };

    const selectAudio = (id) => {
        const hls = hlsRef.current;
        const v = videoRef.current;
        if (hls) hls.audioTrack = id;
        else if (v?.audioTracks) Array.from(v.audioTracks).forEach((t, i) => (t.enabled = i === id));
        setActiveAudio(id);
        setMenu(null);
    };

    const selectSub = (key) => {
        const hls = hlsRef.current;
        const v = videoRef.current;
        const setNativeModes = (activeId) => {
            Array.from(v.textTracks).forEach((t, i) => {
                if (t.kind === "subtitles" || t.kind === "captions") t.mode = i === activeId ? "showing" : "disabled";
            });
        };
        if (key.startsWith("emb:")) {
            const id = Number(key.slice(4));
            if (hls) {
                hls.subtitleTrack = id;
                hls.subtitleDisplay = true;
            } else setNativeModes(id);
        } else {
            // "off" or an external file: turn embedded tracks off
            if (hls) hls.subtitleTrack = -1;
            else setNativeModes(-1);
        }
        setActiveSub(key);
        setNotice(null);
    };

    const onPickSubFile = async (e) => {
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;
        const cues = parseSubs(await f.text());
        if (!cues.length) {
            setNotice("Couldn't read that file. Use an .srt or .vtt subtitle file.");
            return;
        }
        const id = `u${Date.now()}`;
        setExtSubs((prev) => [...prev, {id, label: f.name, cues}]);
        selectSub(`ext:${id}`);
    };

    const changeRate = (r) => {
        if (videoRef.current) videoRef.current.playbackRate = r;
        setMenu(null);
    };

    /* ---------- controls visibility ---------- */
    const poke = useCallback(() => {
        setShowUi(true);
        clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setShowUi(false), 2800);
    }, []);

    useEffect(() => () => clearTimeout(hideTimer.current), []);

    useEffect(() => {
        const onFs = () => setIsFs(document.fullscreenElement === wrapRef.current);
        document.addEventListener("fullscreenchange", onFs);
        return () => document.removeEventListener("fullscreenchange", onFs);
    }, []);

    /* ---------- keyboard shortcuts ---------- */
    useEffect(() => {
        const onKey = (e) => {
            const tag = e.target?.tagName;
            if ((tag === "INPUT" && e.target.type !== "range") || tag === "TEXTAREA") return;

            // Close an open menu first, without closing the whole modal
            if (e.key === "Escape" && menuRef.current) {
                e.stopImmediatePropagation();
                setMenu(null);
                return;
            }

            const step = e.shiftKey ? 10 : 5;
            switch (e.key.toLowerCase()) {
                case " ":
                case "k":
                    togglePlay();
                    break;
                case "arrowleft":
                    seekBy(-step);
                    break;
                case "arrowright":
                    seekBy(step);
                    break;
                case "j":
                    seekBy(-10);
                    break;
                case "l":
                    seekBy(10);
                    break;
                case "arrowup":
                    changeVolume(0.05);
                    break;
                case "arrowdown":
                    changeVolume(-0.05);
                    break;
                case "m":
                    if (videoRef.current) videoRef.current.muted = !videoRef.current.muted;
                    break;
                case "f":
                    toggleFs();
                    break;
                default:
                    return;
            }
            e.preventDefault();
            poke();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [togglePlay, seekBy, changeVolume, toggleFs, poke]);

    /* ---------- video element events ---------- */
    const updateBuffered = () => {
        const v = videoRef.current;
        if (!v) return;
        const b = v.buffered;
        for (let i = 0; i < b.length; i++) {
            if (b.start(i) <= v.currentTime && v.currentTime <= b.end(i)) {
                setBuffered(b.end(i));
                return;
            }
        }
        setBuffered(0);
    };

    const controlsVisible = showUi || !playing || menu !== null;
    const pct = (n) => (duration ? Math.min((n / duration) * 100, 100) : 0);
    const subsOn = activeSub !== "off";
    const extActive = activeSub.startsWith("ext:");

    return (
        <div
            ref={wrapRef}
            onMouseMove={poke}
            onMouseLeave={() => playing && setShowUi(false)}
            className={`relative ${heightClass} w-full select-none overflow-hidden rounded-md bg-black ${
                controlsVisible ? "" : "cursor-none"
            }`}
        >
            <style>{`video::cue{background:rgba(0,0,0,.7);color:#fff;font-size:1.05em}`}</style>

            <video
                ref={videoRef}
                autoPlay
                playsInline
                className="h-full w-full object-contain"
                onClick={() => {
                    setMenu(null);
                    togglePlay();
                }}
                onDoubleClick={toggleFs}
                onPlay={() => setPlaying(true)}
                onPause={() => setPlaying(false)}
                onPlaying={() => setBuffering(false)}
                onCanPlay={() => setBuffering(false)}
                onWaiting={() => setBuffering(true)}
                onTimeUpdate={(e) => {
                    setCurrent(e.currentTarget.currentTime);
                    updateBuffered();
                }}
                onProgress={updateBuffered}
                onDurationChange={(e) => setDuration(e.currentTarget.duration)}
                onVolumeChange={(e) => {
                    setVolume(e.currentTarget.volume);
                    setMuted(e.currentTarget.muted || e.currentTarget.volume === 0);
                }}
                onRateChange={(e) => setRate(e.currentTarget.playbackRate)}
                onError={() =>
                    !hlsRef.current &&
                    setError("This browser can't play this file format. Serve it as an HLS stream (hlsUrl) to play it.")
                }
            />

            {/* external subtitle overlay */}
            {cueText && (
                <div
                    className={`pointer-events-none absolute inset-x-0 flex justify-center px-6 transition-[bottom] duration-200 ${
                        controlsVisible ? "bottom-24" : "bottom-8"
                    }`}
                >
                    <p
                        className="max-w-[85%] whitespace-pre-line rounded bg-black/70 px-3 py-1 text-center text-lg leading-snug text-white"
                        style={{textShadow: "0 1px 2px rgba(0,0,0,.8)"}}
                    >
                        {cueText}
                    </p>
                </div>
            )}

            {/* buffering */}
            {buffering && !error && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span className="material-symbols-outlined animate-spin text-[40px] text-[#3ecf8e]" aria-label="Loading">
                        progress_activity
                    </span>
                </div>
            )}

            {/* error */}
            {error && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 px-8 text-center">
                    <span className="material-symbols-outlined text-[32px] text-[#f87171]" aria-hidden="true">
                        error
                    </span>
                    <p className="max-w-md text-sm text-[#fafafa]">{error}</p>
                </div>
            )}

            {/* title (fullscreen only; the modal header shows it otherwise) */}
            {isFs && (
                <div
                    className={`pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-black/80 to-transparent px-5 pb-8 pt-4 transition-opacity duration-200 ${
                        controlsVisible ? "opacity-100" : "opacity-0"
                    }`}
                >
                    <p className="truncate text-sm font-medium text-[#fafafa]">{file.name}</p>
                </div>
            )}

            {/* menus */}
            {menu && (
                <div
                    className="absolute bottom-16 right-3 max-h-64 w-64 overflow-auto rounded-md border border-[#2e2e2e] bg-[#1c1c1c]/95 p-1.5 shadow-xl backdrop-blur"
                    onClick={(e) => e.stopPropagation()}
                >
                    {menu === "audio" && (
                        <>
                            <MenuHeading>Audio track</MenuHeading>
                            {audioTracks.length === 0 ? (
                                <p className="px-2 py-2 text-xs leading-relaxed text-[#a1a1a1]">
                                    No alternate audio tracks found. Files with several audio tracks need to be served as an
                                    HLS stream.
                                </p>
                            ) : (
                                audioTracks.map((t) => (
                                    <MenuRow
                                        key={t.id}
                                        active={t.id === activeAudio}
                                        label={t.label}
                                        detail={t.detail}
                                        onClick={() => selectAudio(t.id)}
                                    />
                                ))
                            )}
                        </>
                    )}

                    {menu === "subs" && (
                        <>
                            <MenuHeading>Subtitles</MenuHeading>
                            <MenuRow active={activeSub === "off"} label="Off" onClick={() => selectSub("off")} />

                            {embeddedSubs.length > 0 && <MenuHeading>In the video</MenuHeading>}
                            {embeddedSubs.map((t) => (
                                <MenuRow
                                    key={t.id}
                                    active={activeSub === `emb:${t.id}`}
                                    label={t.label}
                                    detail={t.detail}
                                    onClick={() => selectSub(`emb:${t.id}`)}
                                />
                            ))}

                            {extSubs.length > 0 && <MenuHeading>From files</MenuHeading>}
                            {extSubs.map((t) => (
                                <MenuRow
                                    key={t.id}
                                    active={activeSub === `ext:${t.id}`}
                                    label={t.label}
                                    onClick={() => selectSub(`ext:${t.id}`)}
                                />
                            ))}

                            <div className="mt-1 border-t border-[#2e2e2e] pt-1">
                                <button
                                    type="button"
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-[#fafafa] hover:bg-white/10"
                                >
                                    <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                                        upload_file
                                    </span>
                                    Load subtitle file
                                </button>
                                {notice && <p className="px-2 py-1 text-[11px] text-[#f87171]">{notice}</p>}
                            </div>

                            {extActive && (
                                <div className="mt-1 flex items-center justify-between border-t border-[#2e2e2e] px-2 pt-2 text-xs text-[#fafafa]">
                                    <span>Delay</span>
                                    <div className="flex items-center gap-1">
                                        <button
                                            type="button"
                                            aria-label="Show subtitles earlier"
                                            className="rounded px-1.5 py-0.5 hover:bg-white/10"
                                            onClick={() => setSubDelay((d) => Math.round((d - 0.5) * 10) / 10)}
                                        >
                                            −0.5
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Reset subtitle delay"
                                            className="min-w-[3.5rem] rounded px-1.5 py-0.5 text-center tabular-nums hover:bg-white/10"
                                            onClick={() => setSubDelay(0)}
                                        >
                                            {subDelay > 0 ? "+" : ""}
                                            {subDelay.toFixed(1)}s
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Show subtitles later"
                                            className="rounded px-1.5 py-0.5 hover:bg-white/10"
                                            onClick={() => setSubDelay((d) => Math.round((d + 0.5) * 10) / 10)}
                                        >
                                            +0.5
                                        </button>
                                    </div>
                                </div>
                            )}
                        </>
                    )}

                    {menu === "speed" && (
                        <>
                            <MenuHeading>Playback speed</MenuHeading>
                            {SPEEDS.map((r) => (
                                <MenuRow key={r} active={r === rate} label={r === 1 ? "Normal" : `${r}×`} onClick={() => changeRate(r)} />
                            ))}
                        </>
                    )}
                </div>
            )}

            <input ref={fileInputRef} type="file" accept=".srt,.vtt,text/vtt" className="hidden" onChange={onPickSubFile} />

            {/* control bar */}
            <div
                className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/60 to-transparent px-3 pb-2 pt-10 transition-opacity duration-200 ${
                    controlsVisible ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* seek bar */}
                <div className="group relative mb-1 h-4">
                    <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/20 transition-[height] group-hover:h-1.5">
                        <div className="absolute inset-y-0 left-0 bg-white/30" style={{width: `${pct(buffered)}%`}} />
                        <div className="absolute inset-y-0 left-0 bg-[#3ecf8e]" style={{width: `${pct(current)}%`}} />
                    </div>
                    <div
                        className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3ecf8e] opacity-0 transition-opacity group-hover:opacity-100"
                        style={{left: `${pct(current)}%`}}
                    />
                    <input
                        type="range"
                        min={0}
                        max={duration || 0}
                        step={0.1}
                        value={Math.min(current, duration || 0)}
                        aria-label="Seek"
                        onChange={(e) => {
                            const t = Number(e.target.value);
                            if (videoRef.current) videoRef.current.currentTime = t;
                            setCurrent(t);
                        }}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                    />
                </div>

                <div className="flex items-center gap-1">
                    <button type="button" className={ctrlBtn} onClick={togglePlay} aria-label={playing ? "Pause" : "Play"}>
                        <span className="material-symbols-outlined text-[24px]">{playing ? "pause" : "play_arrow"}</span>
                    </button>
                    <button type="button" className={ctrlBtn} onClick={() => seekBy(-10)} aria-label="Back 10 seconds">
                        <span className="material-symbols-outlined text-[20px]">replay_10</span>
                    </button>
                    <button type="button" className={ctrlBtn} onClick={() => seekBy(10)} aria-label="Forward 10 seconds">
                        <span className="material-symbols-outlined text-[20px]">forward_10</span>
                    </button>

                    <div className="ml-1 flex items-center gap-1">
                        <button
                            type="button"
                            className={ctrlBtn}
                            aria-label={muted ? "Unmute" : "Mute"}
                            onClick={() => videoRef.current && (videoRef.current.muted = !videoRef.current.muted)}
                        >
                            <span className="material-symbols-outlined text-[20px]">
                                {muted ? "volume_off" : volume < 0.5 ? "volume_down" : "volume_up"}
                            </span>
                        </button>
                        <input
                            type="range"
                            min={0}
                            max={1}
                            step={0.05}
                            value={muted ? 0 : volume}
                            aria-label="Volume"
                            onChange={(e) => {
                                const v = videoRef.current;
                                if (!v) return;
                                v.volume = Number(e.target.value);
                                v.muted = v.volume === 0;
                            }}
                            className="h-1 w-20 cursor-pointer accent-[#3ecf8e]"
                        />
                    </div>

                    <span className="ml-2 text-xs tabular-nums text-[#fafafa]/80">
                        {fmtTime(current)} / {fmtTime(duration)}
                    </span>

                    <div className="ml-auto flex items-center gap-1">
                        <button
                            type="button"
                            className={`${ctrlBtn} ${menu === "audio" ? "bg-white/10" : ""}`}
                            aria-label="Audio track"
                            aria-expanded={menu === "audio"}
                            onClick={() => setMenu(menu === "audio" ? null : "audio")}
                        >
                            <span className="material-symbols-outlined text-[20px]">audiotrack</span>
                        </button>
                        <button
                            type="button"
                            className={`${ctrlBtn} ${menu === "subs" ? "bg-white/10" : ""} ${subsOn ? "!text-[#3ecf8e]" : ""}`}
                            aria-label="Subtitles"
                            aria-expanded={menu === "subs"}
                            onClick={() => setMenu(menu === "subs" ? null : "subs")}
                        >
                            <span className="material-symbols-outlined text-[20px]">subtitles</span>
                        </button>
                        <button
                            type="button"
                            className={`${ctrlBtn} w-auto px-2 text-xs tabular-nums ${menu === "speed" ? "bg-white/10" : ""}`}
                            aria-label="Playback speed"
                            aria-expanded={menu === "speed"}
                            onClick={() => setMenu(menu === "speed" ? null : "speed")}
                        >
                            {rate}×
                        </button>
                        {document.pictureInPictureEnabled && (
                            <button type="button" className={ctrlBtn} onClick={togglePip} aria-label="Picture in picture">
                                <span className="material-symbols-outlined text-[20px]">picture_in_picture_alt</span>
                            </button>
                        )}
                        <button type="button" className={ctrlBtn} onClick={toggleFs} aria-label={isFs ? "Exit full screen" : "Full screen"}>
                            <span className="material-symbols-outlined text-[20px]">{isFs ? "fullscreen_exit" : "fullscreen"}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* page: /view/:fileId                                                 */
/* ------------------------------------------------------------------ */

export default function ViewPage() {
    const {fileId} = useParams();
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const name = searchParams.get("name") || "Untitled";
    const kind = searchParams.get("kind");

    const [source, setSource] = useState(null); // {streamUrl, hlsUrl|null}
    const [status, setStatus] = useState("Preparing video…");
    const [error, setError] = useState("");

    useEffect(() => {
        if (kind !== "video") return; // only video is supported for now

        const token = localStorage.getItem("token");
        if (!token) {
            navigate("/");
            return;
        }

        let cancelled = false;
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        setSource(null);
        setStatus("Preparing video…");
        setError("");

        (async () => {
            try {
                const res = await fetch(`${API_URL}/auth/file/${fileId}/public-link`, {
                    method: "POST",
                    headers: {Authorization: `Bearer ${token}`},
                });
                if (res.status === 401) {
                    localStorage.removeItem("token");
                    navigate("/");
                    return;
                }
                const data = await res.json();
                if (!res.ok) throw new Error(data.detail || "Could not open this file.");
                const streamUrl = `${API_URL}/public/stream/${data.public_token}`;
                const hlsBase = `${API_URL}/public/hls/${data.public_token}`;

                // Ask the backend whether this file has extra audio / subtitle tracks.
                // If the endpoint is missing or fails, just play the file directly.
                let hlsUrl = null;
                try {
                    for (let attempt = 0; attempt < 600 && !cancelled; attempt++) {
                        const st = await fetch(`${hlsBase}/status`);
                        if (!st.ok) break;
                        const {state, audio, subs} = await st.json();
                        if (state === "ready") {
                            hlsUrl = `${hlsBase}/master.m3u8`;
                            break;
                        }
                        if (state !== "processing") break; // "direct" or "failed"
                        setStatus(`Preparing ${audio} audio track${audio === 1 ? "" : "s"} and ${subs} subtitle${subs === 1 ? "" : "s"}…`);
                        await sleep(2000);
                    }
                } catch {
                    /* fall back to the plain stream */
                }

                if (!cancelled) setSource({streamUrl, hlsUrl});
            } catch (e) {
                if (!cancelled) setError(e.message || "Could not open this file.");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [fileId, kind, navigate]);

    return (
        <div
            className="flex h-screen flex-col bg-[#171717] text-[#fafafa]"
            style={{fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"}}
        >
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-[#2e2e2e] px-4">
                <button
                    type="button"
                    onClick={() => navigate("/dashboard")}
                    aria-label="Back to files"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-[#898989] transition-colors hover:bg-[#2a2a2a] hover:text-[#fafafa]"
                >
                    <span className="material-symbols-outlined text-[20px]" aria-hidden="true">arrow_back</span>
                </button>
                <h1 className="min-w-0 truncate text-sm font-medium">{name}</h1>
            </header>

            <main className="min-h-0 flex-1 p-4">
                {kind !== "video" ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[#898989]">
                        <span className="material-symbols-outlined text-[40px] text-[#4d4d4d]" aria-hidden="true">
                            visibility_off
                        </span>
                        <p className="text-sm text-[#fafafa]">Preview isn't available for this file type yet.</p>
                    </div>
                ) : error ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
                        <span className="material-symbols-outlined text-[40px] text-[#ff6369]" aria-hidden="true">error</span>
                        <p className="text-sm text-[#ff6369]">{error}</p>
                    </div>
                ) : !source ? (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-[#898989]">
                        <span className="material-symbols-outlined animate-spin text-[32px]" aria-hidden="true">
                            progress_activity
                        </span>
                        {status}
                    </div>
                ) : (
                    <div className="mx-auto h-full w-full max-w-7xl">
                        <VideoPlayer file={{name}} streamUrl={source.streamUrl} hlsUrl={source.hlsUrl} heightClass="h-full" />
                    </div>
                )}
            </main>
        </div>
    );
}