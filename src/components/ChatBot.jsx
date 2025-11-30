// src/components/ChatBot.jsx
import React, { useState, useRef, useEffect } from "react";

/**
 * ChatBot
 *  - Hold to talk (record)
 *  - Sends audio blob to backend -> expects { success, transcript }
 *  - Sends transcript as JSON to backend -> expects { success, replyText, audioBase64 }
 *  - Displays transcript (user) and replyText (assistant) and plays audioBase64 if present
 *
 * Backend endpoints:
 *  - POST <VOICE_URL> (multipart/form-data, field "file") -> returns { success, transcript, ... }
 *  - POST <VOICE_URL> (application/json, { text }) -> returns { success, replyText, audioBase64? }
 *
 * Env:
 *  VITE_BACKEND_URL=http://localhost:4000
 */

const BACKEND_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_BACKEND_URL) ||
  "http://localhost:4000";
const VOICE_URL = `${BACKEND_BASE.replace(/\/$/, "")}/api/voice`;

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: "assistant", text: "Hi — hold the mic and speak. I'll transcribe and reply." }]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [permissionError, setPermissionError] = useState("");
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [input, setInput] = useState("");

  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const audioRef = useRef(new Audio());
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, open]);

  // safe fetch that returns parsed JSON or throws
  async function safeFetchJson(url, options) {
    const resp = await fetch(url, options);
    const text = await resp.text();

    if (!resp.ok) {
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch (e) {}
      console.error("Voice backend error:", resp.status, parsed ?? text);
      throw new Error(parsed?.error ?? parsed ?? `Voice API error ${resp.status}`);
    }

    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { throw new Error("Invalid JSON from backend"); }
  }

  // convert base64 -> Blob (used to play returned audio)
  const base64ToBlob = (b64, mime = "audio/ogg") => {
    const bytes = atob(b64);
    const len = bytes.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = bytes.charCodeAt(i);
    return new Blob([arr], { type: mime });
  };

  // Start recording
  const startRecording = async () => {
    setPermissionError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        chunksRef.current = [];
        // first: send audio for transcription
        await handleAudioFlow(blob);
        try { stream.getTracks().forEach((t) => t.stop()); } catch (e) {}
      };

      recorder.start();
      setRecording(true);
    } catch (err) {
      console.error("Microphone error:", err);
      setPermissionError("Unable to access microphone. Allow permission and try again.");
    }
  };

  // Stop recording
  const stopRecording = () => {
    try {
      const r = mediaRecorderRef.current;
      if (r && r.state !== "inactive") r.stop();
    } catch (e) {}
    setRecording(false);
  };

  // Full audio -> transcript -> assistant reply flow
  async function handleAudioFlow(blob) {
    setLoading(true);
    try {
      // 1) Send audio blob for transcription (multipart/form-data)
      const form = new FormData();
      form.append("file", blob, "voice.webm");
      form.append("history", JSON.stringify(messages.slice(-10))); // optional context

      const transResp = await safeFetchJson(VOICE_URL, { method: "POST", body: form });

      if (!transResp || !transResp.success) {
        // show fallback message
        setMessages((m) => [...m, { role: "assistant", text: transResp?.error || "Could not transcribe audio." }]);
        return;
      }

      const transcript = transResp.transcript || "";
      if (!transcript) {
        setMessages((m) => [...m, { role: "assistant", text: "No speech recognized." }]);
        return;
      }

      // Append user's transcribed message to UI
      setMessages((m) => [...m, { role: "user", text: transcript }]);

      // 2) Send transcript as text-mode to get assistant reply (and TTS)
      const textResp = await safeFetchJson(VOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: transcript, history: messages.slice(-10) }),
      });

      if (!textResp || !textResp.success) {
        setMessages((m) => [...m, { role: "assistant", text: textResp?.error || "Assistant failed to respond." }]);
        return;
      }

      const replyText = textResp.replyText ?? "(no reply text)";
      setMessages((m) => [...m, { role: "assistant", text: replyText }]);

      // Play audio if available and enabled
      if (voiceEnabled && textResp.audioBase64) {
        try {
          const blob = base64ToBlob(textResp.audioBase64);
          const url = URL.createObjectURL(blob);
          audioRef.current.src = url;
          await audioRef.current.play().catch((e) => console.warn("autoplay blocked", e));
          audioRef.current.onended = () => URL.revokeObjectURL(url);
        } catch (e) {
          console.warn("Playback failed:", e);
        }
      }
    } catch (err) {
      console.error("handleAudioFlow error:", err);
      setMessages((m) => [...m, { role: "assistant", text: "Something went wrong processing your audio." }]);
    } finally {
      setLoading(false);
    }
  }

  // Text-send shortcut (typed input)
  const sendText = async (txt) => {
    if (!txt || !txt.trim()) return;
    const text = txt.trim();
    setMessages((m) => [...m, { role: "user", text }]);
    setInput("");
    setLoading(true);
    try {
      const data = await safeFetchJson(VOICE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, history: messages.slice(-10) }),
      });
      if (!data || !data.success) {
        setMessages((m) => [...m, { role: "assistant", text: data?.error || "Assistant error." }]);
        return;
      }
      const replyText = data.replyText ?? "(no reply text)";
      setMessages((m) => [...m, { role: "assistant", text: replyText }]);

      if (voiceEnabled && data.audioBase64) {
        try {
          const blob = base64ToBlob(data.audioBase64);
          const url = URL.createObjectURL(blob);
          audioRef.current.src = url;
          await audioRef.current.play().catch(() => {});
          audioRef.current.onended = () => URL.revokeObjectURL(url);
        } catch (e) {
          console.warn("Playback error:", e);
        }
      }
    } catch (err) {
      console.error("sendText error:", err);
      setMessages((m) => [...m, { role: "assistant", text: "Failed to reach assistant." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <div className="fixed right-6 bottom-6 z-[1000]">
        <button onClick={() => setOpen((o) => !o)} className="w-14 h-14 rounded-full bg-indigo-600 shadow-lg flex items-center justify-center text-white text-xl font-bold">
          💬
        </button>
      </div>

      {open && (
        <div className="fixed right-6 bottom-24 z-[1000] w-[340px] md:w-[420px] rounded-2xl bg-white/5 backdrop-blur p-3 border border-gray-800 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-sm font-semibold">MindBot — Voice & Text</div>
              <div className="text-xs text-gray-400">Record, I'll transcribe and reply. No API keys in browser.</div>
            </div>

            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-xs">
                <input type="checkbox" checked={voiceEnabled} onChange={(e) => setVoiceEnabled(e.target.checked)} />
                Auto-play
              </label>
              <button onClick={() => setOpen(false)} className="text-xs px-2 py-1 rounded bg-gray-800/40">Close</button>
            </div>
          </div>

          <div ref={listRef} className="h-52 overflow-auto space-y-2 mb-2 p-2 bg-black/10 rounded">
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`p-2 rounded max-w-[85%] ${m.role === "user" ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-100"}`}>
                  <div className="text-xs mb-1">{m.role === "user" ? "You" : "MindBot"}</div>
                  <div className="text-sm">{m.text}</div>
                </div>
              </div>
            ))}
            {loading && <div className="text-xs text-gray-400">Processing…</div>}
            {permissionError && <div className="text-xs text-red-400">{permissionError}</div>}
          </div>

          <div className="flex gap-2 items-center">
            <button
              onMouseDown={(e) => { e.preventDefault(); startRecording(); }}
              onMouseUp={(e) => { e.preventDefault(); stopRecording(); }}
              onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
              onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
              className={`px-3 py-2 rounded bg-indigo-500 text-black font-semibold ${recording ? "opacity-80" : ""}`}
            >
              {recording ? "Recording..." : "Hold to Talk"}
            </button>

            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") sendText(input); }}
              placeholder="Or type a message…"
              className="flex-1 px-3 py-2 rounded bg-gray-900 text-white text-sm"
            />

            <button onClick={() => sendText(input)} className="px-3 py-2 rounded bg-indigo-600 text-black font-semibold">{loading ? "…" : "Send"}</button>
          </div>

          <div className="text-xs text-gray-400 mt-2">Tip: Hold the mic button while speaking, then release to send.</div>
        </div>
      )}
    </>
  );
}
