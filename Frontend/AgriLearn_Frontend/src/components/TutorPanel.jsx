import { useEffect, useRef, useState } from "react";
import { askTutor, getHistory } from "../api/tutor";

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;
const canListen = "speechSynthesis" in window;

// Strip markdown so the voice doesn't read out asterisks and hashes
const toSpeech = (t) =>
  t.replace(/[*_#`>]/g, "").replace(/\[(.*?)\]\(.*?\)/g, "$1");

// Rough check for Kiswahili text so Listen picks the right voice.
// Falls back to the dropdown language when unsure.
const SW_HINTS =
  /\b(na|ya|wa|kwa|ni|za|la|katika|kwamba|lakini|hii|hiyo|sana|mimea|mahindi|shamba|kupanda|kilimo|mbolea|maarifa|jumla)\b/gi;
const detectLang = (text, fallback) =>
  (text.match(SW_HINTS) || []).length >= 3 ? "sw-KE" : fallback;

export default function TutorPanel({ cycleId = null }) {
  const [messages, setMessages] = useState([]); // {id, role, text, source}
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recording, setRecording] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [lang, setLang] = useState("en-KE"); // or "sw-KE"
  const [speakingId, setSpeakingId] = useState(null);
  const recogRef = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([]);
    setError("");
    getHistory(cycleId)
      .then((rows) =>
        setMessages(
          rows.flatMap((r) => [
            { id: `q${r.id}`, role: "student", text: r.question },
            { id: `a${r.id}`, role: "tutor", text: r.answer, source: "ai" },
          ])
        )
      )
      .catch((e) => setError(e.message));
    return () => window.speechSynthesis?.cancel();
  }, [cycleId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ---------- Listening (text to speech) ----------
  const speak = (id, text) => {
    window.speechSynthesis.cancel();
    if (speakingId === id) return setSpeakingId(null); // toggle off
    const u = new SpeechSynthesisUtterance(toSpeech(text));
    u.lang = detectLang(text, lang); // voice follows the answer's language
    u.rate = 0.95;
    u.onend = () => setSpeakingId(null);
    u.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(u);
  };

  // ---------- Speaking (speech to text) ----------
  const toggleMic = () => {
    if (recording) return recogRef.current?.stop();
    const r = new SpeechRecognition();
    r.lang = lang; // speech recognition can't auto-detect: the dropdown decides
    r.interimResults = true;
    r.onresult = (e) =>
      setInput(Array.from(e.results).map((x) => x[0].transcript).join(""));
    r.onend = () => setRecording(false);
    r.onerror = (e) => {
      setRecording(false);
      setError(
        e.error === "not-allowed"
          ? "Microphone access is blocked. Allow it in the browser."
          : "Couldn't hear that. Try again."
      );
    };
    recogRef.current = r;
    setError("");
    setRecording(true);
    r.start();
  };

  // ---------- Send ----------
  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    window.speechSynthesis?.cancel();
    setInput("");
    setError("");
    setMessages((m) => [...m, { id: `q${Date.now()}`, role: "student", text: q }]);
    setLoading(true);
    try {
      const res = await askTutor(cycleId, q);
      const id = `a${res.id ?? Date.now()}`;
      setMessages((m) => [
        ...m,
        { id, role: "tutor", text: res.answer, source: res.source },
      ]);
      if (autoRead && canListen) speak(id, res.answer);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-green-100 px-4 py-3">
        <h2 className="font-semibold text-green-800">Farm Tutor</h2>
        <div className="flex items-center gap-3 text-sm">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value)}
            title="Speaking Kiswahili? Choose it here before using the microphone"
            className="rounded border border-green-200 px-1 py-0.5"
          >
            <option value="en-KE">English</option>
            <option value="sw-KE">Kiswahili</option>
          </select>
          {canListen && (
            <label className="flex items-center gap-1 text-green-800">
              <input
                type="checkbox"
                checked={autoRead}
                onChange={(e) => setAutoRead(e.target.checked)}
              />
              Read aloud
            </label>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {messages.length === 0 && !loading && (
          <p className="text-sm text-gray-500">
            {cycleId
              ? "Ask anything about your crop: when to plant, how much fertiliser, why the leaves look yellow. Unaweza kuuliza kwa Kiswahili pia."
              : "Think out loud. Ask why we plant in rows, what fertiliser does, or anything about farming. Unaweza kuuliza kwa Kiswahili pia."}
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === "student" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm ${
                m.role === "student"
                  ? "bg-green-600 text-white"
                  : m.source === "ai"
                  ? "bg-green-50 text-gray-800"
                  : "bg-amber-50 text-amber-900"
              }`}
            >
              {m.text}
              {m.role === "tutor" && canListen && (
                <button
                  onClick={() => speak(m.id, m.text)}
                  className="mt-2 block text-xs font-medium text-green-700 hover:underline"
                >
                  {speakingId === m.id ? "■ Stop" : "▶ Listen"}
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="text-sm text-gray-400">Tutor is thinking…</div>
        )}
        <div ref={bottomRef} />
      </div>

      {error && <p className="px-4 pb-1 text-xs text-red-600">{error}</p>}

      {/* Input */}
      <div className="flex items-end gap-2 border-t border-green-100 p-3">
        {SpeechRecognition && (
          <button
            onClick={toggleMic}
            aria-label={recording ? "Stop recording" : "Speak your question"}
            className={`h-10 w-10 shrink-0 rounded-full text-lg ${
              recording ? "animate-pulse bg-red-500 text-white" : "bg-green-100"
            }`}
          >
            🎤
          </button>
        )}
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          rows={1}
          maxLength={500} // match services.MAX_QUESTION_CHARS
          placeholder={
            recording ? "Listening…" : cycleId ? "Ask about your farm" : "Type your question"
          }
          className="max-h-24 flex-1 resize-none rounded-xl border border-green-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-400"
        />
        <button
          onClick={send}
          disabled={loading || !input.trim()}
          className="h-10 rounded-xl bg-green-600 px-4 text-sm font-medium text-white disabled:opacity-40"
        >
          Ask
        </button>
      </div>
    </div>
  );
}