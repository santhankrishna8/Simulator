"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { buzz } from "@/audio";
import { sim } from "@/sim/client";
import { useStore } from "@/store";
import Canvas from "./Canvas";
import Drawer from "./Drawer";
import Inspector from "./Inspector";
import LessonLibrary from "./LessonLibrary";
import Tutor from "./Tutor";
import { GraphicsDefs } from "./PartGraphics";

const Dock = dynamic(() => import("./Dock"), { ssr: false });

/** Keep the worker in sync with the store, and the store in sync with the worker. */
function useSimLink() {
  useEffect(() => {
    const st = useStore.getState();
    sim.onFrame = (frame) => useStore.getState().applyFrame(frame);
    sim.onError = (message) => {
      const s = useStore.getState();
      s.setRunning(false);
      buzz(false);
      s.say(`Simulation stopped: ${message}`);
    };
    st.restore();
    return useStore.subscribe((s, prev) => {
      if (s.doc !== prev.doc) sim.send({ t: "doc", doc: s.doc });
      if (s.pressed !== prev.pressed) sim.send({ t: "pressed", ids: Array.from(s.pressed) });
    });
  }, []);
}

/** Re-check the lesson's goals whenever something they depend on changes, at most once per frame. */
function useLessonChecks() {
  useEffect(() => {
    let queued = false;
    const unsub = useStore.subscribe((s, prev) => {
      if (!s.lesson) return;
      if (s.doc === prev.doc && s.code === prev.code && s.build === prev.build && s.running === prev.running && s.snapshot === prev.snapshot && s.serial === prev.serial && s.lesson === prev.lesson) return;
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        useStore.getState().evaluateLesson();
      });
    });
    return unsub;
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable || el.closest(".cm-editor")) return;
      const st = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Escape") st.set({ wiring: null, selection: null, placing: null });
      else if (e.key === "Delete" || e.key === "Backspace") st.deleteSelected();
      else if (!mod && e.key.toLowerCase() === "r") st.rotateSelected();
      else if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        st.redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}

function Clock() {
  const t = useStore((s) => s.snapshot?.time ?? 0);
  const speed = useStore((s) => s.speed);
  const running = useStore((s) => s.running);
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return (
    <span className="clock" aria-label="Simulated time">
      {running && speed < 0.9 && <em title="Your device cannot keep up, so simulated time runs slower than real time.">{Math.round(speed * 100)}% speed</em>}
      {String(m).padStart(2, "0")}:{s}
    </span>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => set({ toast: null }), 3600);
    return () => clearTimeout(id);
  }, [toast, set]);
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toast && <div className="toast" key={toast.key}>{toast.text}</div>}
    </div>
  );
}

export default function Workbench() {
  useSimLink();
  useLessonChecks();
  useShortcuts();
  const running = useStore((s) => s.running);
  const building = useStore((s) => s.build.status === "building");
  const hasSnapshot = useStore((s) => !!s.snapshot);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const showFlow = useStore((s) => s.showFlow);
  const sound = useStore((s) => s.sound);
  const dockOpen = useStore((s) => s.dockOpen);
  const danger = useStore((s) => s.snapshot?.warnings.filter((w) => w.level !== "info").length ?? 0);
  const lessonActive = useStore((s) => !!s.lesson);
  const tutorOpen = useStore((s) => s.tutorOpen);
  const { set, undo, redo, toggleRun, resetSim, openLibrary, openTutor } = useStore.getState();
  const [sheet, setSheet] = useState<"parts" | "inspect" | "code" | null>(null);

  // On small screens, open the inspector when something gets selected, and
  // clear the sheets when an example loads so the circuit is visible.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (!window.matchMedia("(max-width: 900px)").matches) return;
        if (s.lesson && s.lesson.id !== prev.lesson?.id) {
          // A lesson just started: show its first step, not the bare bench.
          setSheet("inspect");
          useStore.setState({ dockOpen: false });
        } else if (s.fitTick !== prev.fitTick) {
          setSheet(null);
          useStore.setState({ dockOpen: false });
        } else if (s.selection && s.selection !== prev.selection) setSheet("inspect");
      }),
    [],
  );

  const toggleSheet = (name: "parts" | "inspect" | "code") => {
    const next = sheet === name ? null : name;
    setSheet(next);
    set({ dockOpen: next === "code" });
  };

  return (
    <div className="bench" data-sheet={sheet ?? "none"} data-dock={dockOpen ? "open" : "closed"}>
      <GraphicsDefs />
      <header className="topbar">
        <div className="brand">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
            <rect x="1.5" y="1.5" width="21" height="21" rx="5" fill="var(--accent)" />
            <path d="M5 12h3.2l1.6-4.4 3.2 8.8 1.8-4.4H19" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span>Simulator</span>
        </div>

        <div className="tools">
          <button type="button" className={`btn lessons-btn${lessonActive ? " is-on" : ""}`} onClick={() => openLibrary(true)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <path d="M2 4.5L8 2l6 2.5L8 7z" fill="currentColor" />
              <path d="M4 7.5v3c0 1 1.8 2 4 2s4-1 4-2v-3L8 9.2z" fill="currentColor" opacity="0.7" />
            </svg>
            Lessons
          </button>
          <button type="button" className={`btn tutor-btn${tutorOpen ? " is-on" : ""}`} aria-pressed={tutorOpen} onClick={() => openTutor(!tutorOpen)}>
            <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden>
              <path d="M8 1.5l1.4 3.6 3.6 1.4-3.6 1.4L8 11.5 6.6 7.9 3 6.5l3.6-1.4z" fill="currentColor" />
              <path d="M12.5 10.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="currentColor" opacity="0.7" />
            </svg>
            Tutor
          </button>
          <span className="sep" />
          <button type="button" className="btn is-ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" className="btn is-ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
          <span className="sep" />
          <button type="button" className="btn is-ghost toggle" aria-pressed={showFlow} onClick={() => set({ showFlow: !showFlow })}>
            <i /> Current flow
          </button>
          <button type="button" className="btn is-ghost toggle" aria-pressed={sound} onClick={() => { set({ sound: !sound }); if (sound) buzz(false); }}>
            <i /> Sound
          </button>
          <span className="sep" />
          <button type="button" className="btn is-ghost toggle code-toggle" aria-pressed={dockOpen} onClick={() => set({ dockOpen: !dockOpen })}>
            <i /> Code
          </button>
        </div>

        <div className="run">
          <Clock />
          {hasSnapshot && (
            <button type="button" className="btn" onClick={() => { resetSim(); buzz(false); }}>
              Reset
            </button>
          )}
          <button type="button" className={`btn is-primary run-btn${running ? " is-running" : ""}`} onClick={() => void toggleRun()} disabled={building}>
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
              {running ? <path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" /> : <path d="M2.5 1l8 5-8 5z" fill="currentColor" />}
            </svg>
            {building ? "Building" : running ? "Pause" : "Run"}
          </button>
        </div>
      </header>

      <Drawer onPicked={() => setSheet(null)} />
      <main className="stage">
        <div className="stage-canvas">
          <Canvas />
          <Toast />
          <Tutor />
        </div>
        {dockOpen && <Dock />}
      </main>
      <Inspector />
      <LessonLibrary />

      <nav className="tabs" aria-label="Panels">
        <button type="button" aria-pressed={sheet === "parts"} onClick={() => toggleSheet("parts")}>Parts</button>
        <button type="button" aria-pressed={sheet === "code"} onClick={() => toggleSheet("code")}>Code</button>
        <button type="button" aria-pressed={sheet === "inspect"} onClick={() => toggleSheet("inspect")}>
          {lessonActive ? "Lesson" : "Inspect"}{danger > 0 && <em>{danger}</em>}
        </button>
      </nav>
    </div>
  );
}
