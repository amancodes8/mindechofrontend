// src/pages/DashboardPro.jsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Sidebar from "../components/Sidebar";
import Header from "../components/Header";
import EmotionMeter from "../components/EmotionMeter";
import LiveAreaChart from "../components/LiveAreaChart";
import MetricCard from "../components/MetricCard";
import { useAuth } from "../contexts/AuthContext";
import { sensorSimulator } from "../lib/sensorSimulator";
import { inferenceService } from "../lib/inferenceService";
import { simulatePush } from "../services/emotionService";
import FaceEmotionTracker from "../components/FaceEmotionTracker";
import Chatbot from "../components/ChatBot";
import { Sparkles, Activity, Zap, Moon } from "lucide-react";
import { motion, AnimatePresence, useSpring, useMotionValue, useTransform } from "framer-motion";


const clamp = (v, a = -10, b = 10) => Math.max(a, Math.min(b, v));
const fmt = (n, f = 2) => (Number.isFinite(n) ? Number(n).toFixed(f) : "—");

function mapAffectToValue({ calm = 0, focus = 0 }) {
  const raw = focus * 1.25 + calm * 0.9;
  return clamp(raw, -3, 3);
}

const SLEEP_KEY = "mindcare_sleep_timing";

export default function Dashboard() {
  const { user } = useAuth();

  // Chat panel state
  const [chatOpen, setChatOpen] = useState(false);

  // Sleep timing (persisted)
  const [sleepTiming, setSleepTiming] = useState(() => {
    try {
      return localStorage.getItem(SLEEP_KEY) || "";
    } catch {
      return "";
    }
  });

  // Core UI state — anxious removed
  const [emotion, setEmotion] = useState({ primary: "neutral", scores: { calm: 0, focus: 0 } });
  const [running, setRunning] = useState(true);
  const [paused, setPaused] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [tip, setTip] = useState("Waiting for signals...");
  const [showFacePanel, setShowFacePanel] = useState(false);

  // Buffer & signals
  const rawBuffer = useRef([]);
  const rafRef = useRef(null);
  const [signals, setSignals] = useState([]);

  // spring for smooth numeric display
  const latestVal = useMotionValue(0);
  const spring = useSpring(latestVal, { stiffness: 250, damping: 30 });
  const springReadable = useTransform(spring, (v) => Number(v).toFixed(2));

  const getTip = useCallback((p) => {
    if (!p) return "Waiting for signals...";
    if (p === "calm") return "Calm — keep gentle breathing.";
    if (p === "tense") return "Tension detected — try 4 slow breaths.";
    if (p === "focused") return "Focused — short breaks extend flow.";
    return "Stable — hydrate and blink.";
  }, []);

  // sensorSimulator feed
  useEffect(() => {
    if (!user) return;
    let unsub = () => {};
    try {
      unsub = sensorSimulator.on("signals", (s) => {
        if (!running || paused) return;

        // normalize inference
        try {
          const emRaw = inferenceService.inferEmotion(s, user.consent);
          if (emRaw) {
            const normalized = {
              primary: emRaw.primary || "neutral",
              scores: {
                calm: emRaw.scores?.calm ?? 0,
                focus: emRaw.scores?.focus ?? 0,
              },
            };
            setEmotion((prev) => normalized || prev);
            setTip(getTip(normalized.primary));
          }
        } catch (e) {}

        const neuro = s?.neuro;
        const val = neuro && neuro.alpha != null && neuro.beta != null ? parseFloat(neuro.alpha) - parseFloat(neuro.beta) : 0;
        rawBuffer.current.push({ ts: Date.now(), value: Number(val), time: new Date().toLocaleTimeString() });

        try {
          simulatePush(user.id, { v: val, ts: Date.now() });
        } catch {}
      });

      sensorSimulator.start(user.consent);
    } catch (err) {
      console.warn("sensor start error", err);
    }

    return () => {
      try {
        unsub();
        sensorSimulator.stop();
      } catch {}
    };
  }, [user, running, paused, getTip]);

  // FaceEmotionTracker -> onSignal handler
  const handleFaceSignal = useCallback(
    (sig) => {
      if (!sig) return;
      const { calm = 0, focus = 0 } = sig;
      let primary = "neutral";
      if (calm > 0.6 && calm > focus) primary = "calm";
      else if (focus > 0.55 && focus > calm) primary = "focused";
      else if (calm < 0.35 && focus < 0.4) primary = "tense";

      setEmotion({ primary, scores: { calm: Number(calm), focus: Number(focus) } });
      setTip(getTip(primary));

      const mapped = mapAffectToValue({ calm, focus });
      rawBuffer.current.push({ ts: Date.now(), value: Number(mapped), time: new Date().toLocaleTimeString(), source: "camera" });

      try {
        simulatePush(user?.id, { faceSignal: true, ts: Date.now(), calm, focus });
      } catch {}
    },
    [getTip, user?.id]
  );

  // RAF draining
  useEffect(() => {
    const tick = () => {
      if (rawBuffer.current.length) {
        const take = rawBuffer.current.splice(0, 4);
        setSignals((prev) => {
          const merged = [...prev, ...take].slice(-160);
          const newest = merged.length ? merged[merged.length - 1].value : 0;
          latestVal.set(newest);
          return merged;
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  // keyboard boost
  useEffect(() => {
    const onKey = (e) => {
      if (e.key && e.key.toLowerCase() === "b") {
        setBoosting(true);
        setTimeout(() => setBoosting(false), 1300);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const takeSnapshot = () => {
    try {
      simulatePush(user?.id, { snapshot: true, at: Date.now(), preview: signals.slice(-8) });
    } catch {}
  };

  const toggleRunning = () => setRunning((r) => !r);
  const togglePause = () => setPaused((p) => !p);

  // metrics
  const metrics = useMemo(
    () => [
      { title: "Wellbeing", value: "78%", trend: "+9%", note: "vs last week", Icon: Activity },
      { title: "Energy", value: "82%", trend: "Stable", note: "Slight improvement", Icon: Zap },
      { title: "Sleep", value: "6.5h", trend: "↑", note: "Keep bedtime", Icon: Moon },
    ],
    []
  );

  // spark values
  const sparkValues = useMemo(() => {
    const arr = signals.slice(-18).map((s) => s.value);
    if (!arr.length) return [];
    const max = Math.max(...arr),
      min = Math.min(...arr),
      range = Math.max(1e-6, max - min);
    return arr.map((v) => (v - min) / range);
  }, [signals]);

  // Listen for global events to open/close chat (Sidebar wiring)
  useEffect(() => {
    const onOpen = () => setChatOpen(true);
    const onCloseEvent = () => setChatOpen(false);
    window.addEventListener("open-chat-panel", onOpen);
    window.addEventListener("close-chat-panel", onCloseEvent);
    return () => {
      window.removeEventListener("open-chat-panel", onOpen);
      window.removeEventListener("close-chat-panel", onCloseEvent);
    };
  }, []);

  // --- Sleep timing helpers ---
  const saveSleepTiming = (val) => {
    try {
      if (!val) {
        localStorage.removeItem(SLEEP_KEY);
        setSleepTiming("");
      } else {
        localStorage.setItem(SLEEP_KEY, val);
        setSleepTiming(val);
      }
    } catch {
      // ignore storage errors
    }
  };

  const onSetSleepTiming = () => {
    const examples = "Examples: `23:00-07:00`, `11pm-7am`, `23:30-06:30`";
    const current = sleepTiming || "";
    const input = window.prompt(`Enter your sleep timing range.\n${examples}\n\nLeave empty to cancel.`, current);
    if (input === null) return; // cancelled
    const trimmed = input.trim();
    if (!trimmed) return; // no change
    saveSleepTiming(trimmed);
    try {
      // toast if available
      const ev = new CustomEvent("toast", { detail: { title: "Sleep timing saved", description: trimmed, tone: "success", duration: 2200 } });
      window.dispatchEvent(ev);
    } catch {}
  };

  const onClearSleepTiming = () => {
    if (!sleepTiming) return;
    if (!window.confirm("Clear saved sleep timing?")) return;
    saveSleepTiming("");
    try {
      const ev = new CustomEvent("toast", { detail: { title: "Cleared", description: "Sleep timing removed", tone: "info", duration: 1600 } });
      window.dispatchEvent(ev);
    } catch {}
  };

  return (
    <div className="flex min-h-screen bg-gradient-to-b from-gray-900 via-gray-950 to-black text-gray-100">
      <Sidebar />

      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        <Header />

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} className="max-w-7xl mx-auto">
          {/* HERO */}
          <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
            <div className="md:col-span-2">
              <h1 className="text-2xl md:text-3xl font-extrabold">Dashboard</h1>
              <p className="text-sm text-gray-400 mt-1">Real-time neurofeedback — local & private.</p>
            </div>

            <div className="flex gap-3 justify-start md:justify-end items-center">
              <button
                onClick={() => {
                  setBoosting(true);
                  setTimeout(() => setBoosting(false), 1400);
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl font-semibold ${boosting ? "bg-gradient-to-r from-yellow-400 to-red-400 text-black" : "bg-gradient-to-r from-indigo-600 to-purple-600 text-white"}`}
              >
                <Sparkles className="w-4 h-4" /> {boosting ? "Boosting…" : "Boost (B)"}
              </button>

              <div className="hidden md:flex items-center bg-white/5 text-gray-300 text-xs px-3 py-2 rounded-2xl border border-white/6">
                <span className="mr-2">Live</span>
                <span className="font-mono">{new Date().toLocaleTimeString()}</span>
              </div>

              {/* Camera toggle — opens the FaceEmotionTracker panel */}
              <button
                onClick={() => setShowFacePanel((s) => !s)}
                className={`px-3 py-2 rounded-xl text-sm ${showFacePanel ? "bg-gray-800/60" : "bg-gray-800/30"}`}
                title="Toggle camera emotion tracker"
              >
                {showFacePanel ? "Camera On" : "Camera"}
              </button>

              {/* Chat toggle */}
              <button
                onClick={() => setChatOpen((c) => !c)}
                className="px-3 py-2 rounded-xl text-sm bg-emerald-700/80 hover:bg-emerald-700/100"
                title="Open MindCare Chat"
              >
                Chat
              </button>

              {/* Sleep timing setter */}
              <button
                onClick={onSetSleepTiming}
                className="px-3 py-2 rounded-xl text-sm bg-violet-700/90 hover:bg-violet-700/100"
                title="Set sleep timing"
              >
                {sleepTiming ? `Sleep: ${sleepTiming}` : "Set Sleep Time"}
              </button>
            </div>
          </div>

          {/* GRID */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <motion.section className="xl:col-span-8 bg-gradient-to-b from-gray-850 to-gray-900 rounded-2xl p-5 border border-gray-800 shadow-lg">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold">Neuro Mirror — Live</h2>
                  <p className="text-xs text-gray-400 mt-1">Low-latency, local processing</p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-xs text-gray-400">Points: <span className="font-medium text-gray-100">{signals.length}</span></div>

                  <div className="flex items-center gap-2">
                    <button onClick={toggleRunning} className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm">{running ? "Stop" : "Start"}</button>
                    <button onClick={togglePause} className="px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-sm">{paused ? "Resume" : "Pause"}</button>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 bg-gradient-to-b from-gray-800/60 to-gray-900/40 rounded-xl p-3 border border-gray-800 overflow-hidden">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-gray-300">EEG Trend (or mapped camera value)</div>
                    <div className="text-xs text-gray-500">Recent</div>
                  </div>

                  <div className="w-full h-44 md:h-56 lg:h-64">
                    <LiveAreaChart data={signals} dark compact />
                  </div>

                  <div className="mt-3 flex items-center justify-between text-xs text-gray-400">
                    <div>Last value: <span className="font-medium text-gray-100">{signals.length ? fmt(signals.at(-1).value) : "—"}</span></div>
                    <div>Buffered: <span className="font-medium">{signals.length}</span></div>
                  </div>
                </div>

                <div className="rounded-xl p-3 bg-gradient-to-br from-gray-850 to-gray-900 border border-gray-800 flex flex-col justify-between">
                  <div className="mb-4">  <EmotionMeter emotion={emotion} compact /></div>
                  <div>
                    <div className="text-sm text-gray-300">Primary State</div>
                    <div className="mt-3 flex items-center gap-3">
                      <div>
                        <div className="text-lg font-semibold capitalize">{emotion.primary}</div>
                        <div className="text-xs text-gray-400 mt-1">{tip}</div>
                        <div className="text-xs text-gray-500 mt-1">Calm: {emotion.scores.calm?.toFixed(2)} • Focus: {emotion.scores.focus?.toFixed(2)}</div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-4">
                    <div className="text-xs text-gray-400 mb-2">Actions</div>
                    <div className="flex gap-2">
                      <button onClick={() => takeSnapshot()} className="flex-1 px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-sm">Snapshot</button>
                      <button onClick={() => { try { simulatePush(user?.id, { demo: true }); } catch {} }} className="px-3 py-2 rounded-lg bg-indigo-600 text-black font-medium">Boost</button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <h3 className="text-sm text-gray-300 mb-2">Recent Signals</h3>
                <div className="space-y-2 max-h-44 overflow-auto pr-2">
                  <AnimatePresence initial={false}>
                    {signals.slice().reverse().slice(0, 40).map((s, i) => (
                      <motion.div key={`${s.ts}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.14 }} className="flex items-center justify-between px-3 py-2 rounded-lg bg-gray-800/60 border border-gray-800">
                        <div className="text-xs text-gray-400">{s.time} {s.source === "camera" && <span className="ml-2 text-xs text-emerald-400">cam</span>}</div>
                        <div className="text-sm font-mono text-gray-100">{fmt(s.value)}</div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </div>
            </motion.section>

            <motion.aside className="xl:col-span-4 flex flex-col gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {metrics.map((m) => (
                  <motion.div whileHover={{ y: -4 }} key={m.title}>
                    <MetricCard title={m.title} value={m.value} trend={m.trend} note={m.note} Icon={m.Icon || m.icon} />
                  </motion.div>
                ))}
              </div>

              <div className="bg-gradient-to-b from-gray-850 to-gray-900 rounded-2xl p-4 border border-gray-800">
                <h4 className="text-sm font-semibold text-gray-200">Activity Snapshot</h4>
                <p className="text-xs text-gray-400 mb-3">Short-term trend from recent signals.</p>
                <div className="h-28">
                  <LiveAreaChart data={signals} compact dark />
                </div>
              </div>

              <div className="bg-gradient-to-br from-indigo-700 to-purple-700 text-white rounded-2xl p-4 shadow-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">Mindful Minute</div>
                    <div className="text-xs opacity-90 mt-1">A tiny exercise to reset attention</div>
                  </div>
                  <button onClick={() => { alert("Start a 60s breathing session — inhale 4s, hold 4s, exhale 4s."); }} className="bg-white/12 px-3 py-2 rounded-md text-white font-semibold">Start</button>
                </div>
              </div>

              <div className="bg-gradient-to-b from-gray-850 to-gray-900 rounded-2xl p-4 border border-gray-800 text-center">
                <div className="text-sm text-gray-300 font-semibold">Mindfulness Summary</div>
                <div className="mt-2 text-xs text-gray-400">Consistency matters — small daily practices compound.</div>
                <div className="mt-3 flex justify-center gap-2 items-center">
                  <div className="bg-purple-800 px-3 py-2 rounded-lg text-purple-100 text-sm">🧘 4 Sessions</div>
                  <div className="bg-blue-800 px-3 py-2 rounded-lg text-blue-100 text-sm">🎯 3 Focus Wins</div>
                </div>

                {/* sleep timing display + clear */}
                <div className="mt-4">
                  {sleepTiming ? (
                    <div className="flex items-center justify-center gap-3">
                      <div className="text-xs text-gray-200">Saved sleep timing:</div>
                      <div className="px-3 py-1 rounded-lg bg-white/6 text-sm text-gray-100 font-medium">{sleepTiming}</div>
                      <button onClick={onClearSleepTiming} className="text-xs px-2 py-1 rounded bg-gray-800/40">Clear</button>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">No sleep timing set — click <span className="font-medium text-gray-200">Set Sleep Time</span> above.</div>
                  )}
                </div>
              </div>
            </motion.aside>
          </div>
        </motion.div>
      </main>

      {/* FaceEmotionTracker slide-over / panel */}
      <AnimatePresence>
        {showFacePanel && (
          <motion.aside initial={{ x: 360, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 360, opacity: 0 }} transition={{ type: "spring", stiffness: 260, damping: 28 }} className="fixed right-4 bottom-6 z-[1200] w-[360px] md:w-[420px] bg-gradient-to-b from-gray-900/95 to-gray-800/95 border border-gray-800 rounded-2xl shadow-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold">Camera Emotion Tracker</div>
                <div className="text-xs text-gray-400">Runs locally in your browser — no frames uploaded by default</div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowFacePanel(false)} className="text-xs px-2 py-1 rounded bg-gray-800/40">Close</button>
              </div>
            </div>

            {/* FaceEmotionTracker accepts onSignal; it shows its own consent UI */}
            <div>
              <FaceEmotionTracker onSignal={handleFaceSignal} autoStart={false} sampleIntervalMs={600} />
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Chatbot (MindCare) */}
      <Chatbot open={chatOpen} onClose={() => setChatOpen(false)} />
    </div>
  );
}
