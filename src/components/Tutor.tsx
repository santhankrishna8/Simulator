"use client";

import { useEffect, useRef, useState } from "react";
import { lessonById } from "@/lessons";
import { useStore } from "@/store";
import Rich from "./Rich";

/** Questions that make sense right now, given what is on the bench. */
function suggestions(inLesson: boolean, hasWarning: boolean, hasBoard: boolean): string[] {
  if (inLesson) return ["Explain this step in simple words", "I am stuck. What should I check?", "Why does this work?"];
  const list = ["Check my circuit and tell me what you see", "Why isn't it working?", "Explain what is happening in my circuit"];
  if (hasWarning) list.unshift("Explain the warning I am seeing");
  if (hasBoard) list.push("Walk me through my sketch");
  return list.slice(0, 4);
}

export default function Tutor() {
  const open = useStore((s) => s.tutorOpen);
  const messages = useStore((s) => s.tutorMessages);
  const busy = useStore((s) => s.tutorBusy);
  const configured = useStore((s) => s.tutorConfigured);
  const lesson = useStore((s) => s.lesson);
  const warned = useStore((s) => !!s.snapshot?.warnings.some((w) => w.level !== "info"));
  const hasBoard = useStore((s) => s.doc.parts.some((p) => p.type === "uno"));
  const parts = useStore((s) => s.doc.parts.length);
  const { openTutor, askTutor, stopTutor, clearTutor } = useStore.getState();
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  useEffect(() => {
    const el = log.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  if (!open) return null;
  const def = lesson && lessonById(lesson.id);
  const inLesson = !!def && lesson!.step < def.steps.length;
  const off = configured === false;

  const send = (q: string) => {
    if (!q.trim() || busy || off) return;
    stick.current = true;
    setText("");
    void askTutor(q);
  };

  return (
    <aside className="tutor" aria-label="Tutor" onKeyDown={(e) => e.key === "Escape" && openTutor(false)}>
      <header>
        <div>
          <h2>Tutor</h2>
          <p>{inLesson ? `Sees your bench and step ${lesson!.step + 1} of “${def!.title}”` : parts ? "Sees your bench: parts, wiring, readings and code" : "Ask anything about electronics or Arduino"}</p>
        </div>
        <div className="row">
          {messages.length > 0 && <button type="button" className="btn is-ghost" onClick={clearTutor}>Clear</button>}
          <button type="button" className="btn" onClick={() => openTutor(false)} aria-label="Close tutor">Close</button>
        </div>
      </header>

      <div
        className="tutor-log"
        ref={log}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollTop + el.clientHeight >= el.scrollHeight - 30;
        }}
      >
        {off && (
          <div className="tutor-note">
            <b>The tutor is not switched on for this site yet.</b>
            <span>Whoever runs the site needs to add an OpenAI key (the OPENAI_API_KEY setting). Everything else works without it.</span>
          </div>
        )}
        {!messages.length && !off && (
          <div className="tutor-empty">
            <p>Ask about what is on your bench, a part, a warning, or your code. I will not do the work for you, but I will help you see what to check next.</p>
            <ul>
              {suggestions(inLesson, warned, hasBoard).map((q) => (
                <li key={q}><button type="button" className="chip" onClick={() => send(q)}>{q}</button></li>
              ))}
            </ul>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble is-${m.role}${m.error ? " is-error" : ""}`}>
            {m.role === "user" ? <p>{m.content}</p> : m.content ? <Rich text={m.content} /> : <span className="typing" aria-label="Thinking"><i /><i /><i /></span>}
          </div>
        ))}
      </div>

      <form
        className="tutor-send"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <textarea
          ref={input}
          value={text}
          rows={2}
          maxLength={1500}
          disabled={off}
          placeholder={off ? "The tutor is not switched on" : "Ask a question"}
          aria-label="Your question"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send(text);
            }
          }}
        />
        {busy ? (
          <button type="button" className="btn" onClick={stopTutor}>Stop</button>
        ) : (
          <button type="submit" className="btn is-primary" disabled={off || !text.trim()}>Ask</button>
        )}
      </form>
      <p className="tutor-foot">AI answers can be wrong; check them against the simulator. The tutor sees your circuit and code, nothing about you.</p>
    </aside>
  );
}
