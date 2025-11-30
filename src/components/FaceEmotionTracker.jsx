// src/components/FaceEmotionTracker.jsx
import React, { useEffect, useRef, useState } from "react";

/**
 * FaceEmotionTracker
 *
 * Props:
 *  - sampleIntervalMs (default 900)
 *  - smoothing (0..1, default 0.6)
 *  - autoStart (default false)
 *  - onSignal(signal) receives { timestamp, calm, anxious, focus, rawExpressions }
 *  - hideVideo (default false)  => don't show video element to the user (video is kept hidden for capture)
 *  - compact (default false)    => even more compact layout (useful for small panels)
 *
 * Notes:
 *  - Uses your backend /emotion endpoint (Vite: VITE_BACKEND_URL or fallback http://localhost:4000)
 *  - The component decouples the "emotion breakdown bars" (happiness, neutral, sadness, anger, fear)
 *    from the calm/anxious/focus mapping which is emitted via onSignal for your app logic.
 */

const BACKEND_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_BACKEND_URL) ||
  "http://localhost:4000";

const EMOTION_URL = `${BACKEND_BASE.replace(/\/$/, "")}/emotion`;

/* Safe call helper: reads text then parse */
async function callEmotionApi(base64) {
  const resp = await fetch(EMOTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ imageBase64: base64 }),
  });

  const text = await resp.text();

  if (!resp.ok) {
    // throw useful message containing backend body
    throw new Error(`Emotion API error ${resp.status}: ${text || resp.statusText}`);
  }
  if (!text) throw new Error("Emotion API returned empty response");
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error("Emotion API returned invalid JSON");
  }
}

/* Small stat bar used in UI */
function StatBar({ label, value, compact }) {
  const pct = Math.round((value ?? 0) * 100);
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: compact ? 12 : 13 }}>
      <div style={{ width: compact ? 60 : 72 }}>{label}</div>
      <div style={{ flex: 1, height: compact ? 8 : 12, background: "#222", borderRadius: 6, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "#60a5fa", transition: "width 200ms linear" }} />
      </div>
      <div style={{ width: 40, textAlign: "right", fontSize: compact ? 11 : 13 }}>{pct}%</div>
    </div>
  );
}

export default function FaceEmotionTracker({
  sampleIntervalMs = 900,
  smoothing = 0.6,
  autoStart = false,
  onSignal = () => {},
  hideVideo = false,
  compact = false,
}) {
  const videoRef = useRef(null); // hidden or visible
  const canvasRef = useRef(null);
  const inFlightRef = useRef(false);
  const intervalRef = useRef(null);

  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [raw, setRaw] = useState(null);
  const [smoothed, setSmoothed] = useState({
    happiness: 0,
    neutral: 0,
    sadness: 0,
    anger: 0,
    fear: 0,
  });
  const [lastUpdated, setLastUpdated] = useState(null);

  // EMA smoothing
  const ema = (prev = {}, next = {}, alpha = smoothing) => {
    const out = {};
    const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
    keys.forEach((k) => {
      const p = (prev && prev[k]) ?? 0;
      const n = (next && next[k]) ?? 0;
      out[k] = alpha * p + (1 - alpha) * n;
    });
    return out;
  };

  // map raw emotions to calm/anxious/focus so onSignal keeps working for your app
  const mapToSignalsAndEmit = (emotions) => {
    // emotions: { happiness, neutral, sadness, anger, fear } (0..1)
    const happy = emotions.happiness ?? 0;
    const neutral = emotions.neutral ?? 0;
    const sad = emotions.sadness ?? 0;
    const angry = emotions.anger ?? 0;
    const fear = emotions.fear ?? 0;

    const calmRaw = Math.min(1, happy * 0.7 + neutral * 0.6 - fear * 0.3);
    const anxiousRaw = Math.min(1, fear * 0.7 + (emotions.surprised ?? 0) * 0.5 + angry * 0.4);
    const focusRaw = Math.min(1, neutral * 0.6 + (1 - (emotions.surprised ?? 0)) * 0.3 + happy * 0.1);

    const calm = Math.max(0, Math.min(1, calmRaw));
    const anxious = Math.max(0, Math.min(1, anxiousRaw));
    const focus = Math.max(0, Math.min(1, focusRaw));

    onSignal({ timestamp: Date.now(), calm, anxious, focus, rawExpressions: emotions });
  };

  // start the camera (video can be hidden)
  const startCamera = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: 640, height: 480 }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setRunning(true);

      // begin sampling loop (interval-based to avoid overlapping)
      intervalRef.current = setInterval(sampleAndSend, sampleIntervalMs);
    } catch (err) {
      console.error("Camera start error:", err);
      setError("Unable to access camera. Allow camera permission and use HTTPS or localhost.");
    }
  };

  const stopCamera = () => {
    setRunning(false);
    clearInterval(intervalRef.current);
    intervalRef.current = null;
    const s = videoRef.current?.srcObject;
    if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {}
    }
  };

  // sampling + sending frame to backend
  async function sampleAndSend() {
    if (inFlightRef.current) return;
    const video = videoRef.current;
    if (!video) return;

    try {
      const w = video.videoWidth || 320;
      const h = video.videoHeight || 240;
      const canvas = canvasRef.current || document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(video, 0, 0, w, h);

      const base64 = canvas.toDataURL("image/jpeg", 0.7).split(",")[1];

      inFlightRef.current = true;
      const data = await callEmotionApi(base64);
      inFlightRef.current = false;

      if (!data) return;
      setRaw(data.raw ?? data);

      if (data.success && data.emotions) {
        const next = {
          happiness: Number(data.emotions.happiness ?? 0),
          neutral: Number(data.emotions.neutral ?? 0),
          sadness: Number(data.emotions.sadness ?? 0),
          anger: Number(data.emotions.anger ?? 0),
          fear: Number(data.emotions.fear ?? 0),
        };
        setSmoothed((prev) => {
          const mixed = ema(prev, next, smoothing);
          setLastUpdated(Date.now());
          // also emit mapped calm/anxious/focus
          mapToSignalsAndEmit(next);
          return mixed;
        });
      } else {
        // server returned false or different shape
        console.warn("Emotion API returned unexpected payload", data);
      }
    } catch (err) {
      inFlightRef.current = false;
      console.error("Emotion processing error:", err);
      setError(err.message || String(err));
    }
  }

  useEffect(() => {
    if (autoStart) startCamera();
    return () => {
      clearInterval(intervalRef.current);
      const s = videoRef.current?.srcObject;
      if (s && s.getTracks) s.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // UI layout
  return (
    <div style={{ width: compact ? 320 : 360, padding: compact ? 8 : 12, borderRadius: 12, background: "rgba(17,24,39,0.6)", color: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: compact ? 8 : 10 }}>
        <div style={{ fontSize: compact ? 13 : 15, fontWeight: 600 }}>Emotion (Live)</div>
        <div style={{ fontSize: 12, color: "#9ca3af" }}>{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : "idle"}</div>
      </div>

      {/* hidden or visible video (for capture). When hideVideo is true, we keep it visually hidden */}
      <div style={{ display: hideVideo ? "none" : "block", marginBottom: 8 }}>
        <video ref={videoRef} muted playsInline style={{ width: "100%", borderRadius: 8, background: "#000" }} />
      </div>

      {/* buttons and compact UI */}
      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
        {!running ? (
          <button onClick={startCamera} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "none", background: "#10b981", color: "#fff", cursor: "pointer" }}>
            Start
          </button>
        ) : (
          <button onClick={stopCamera} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "none", background: "#ef4444", color: "#fff", cursor: "pointer" }}>
            Stop
          </button>
        )}
        <div style={{ width: 8 }} />
        <div style={{ alignSelf: "center", fontSize: 12, color: "#cbd5e1" }}>Interval {Math.round(sampleIntervalMs)}ms</div>
      </div>

      {/* small bars */}
      <div style={{ display: "grid", gap: 8 }}>
        <StatBar label="Happiness" value={smoothed.happiness} compact={compact} />
        <StatBar label="Neutral" value={smoothed.neutral} compact={compact} />
        <StatBar label="Sadness" value={smoothed.sadness} compact={compact} />
        <StatBar label="Anger" value={smoothed.anger} compact={compact} />
        <StatBar label="Fear" value={smoothed.fear} compact={compact} />
      </div>

      {error && <div style={{ marginTop: 8, color: "#fecaca", fontSize: 12 }}>{error}</div>}

      {/* hidden canvas used for capture */}
      <canvas ref={canvasRef} style={{ display: "none" }} />
    </div>
  );
}
