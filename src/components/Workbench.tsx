"use client";

import { useEffect, useState } from "react";
import { buzz } from "@/audio";
import { engine, loadSaved, useStore } from "@/store";
import Canvas from "./Canvas";
import Drawer from "./Drawer";
import Inspector from "./Inspector";
import { GraphicsDefs } from "./PartGraphics";

function useSimLoop() {
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const st = useStore.getState();
      if (!st.running) return;
      const snapshot = engine.advance(st.doc, st.pressed, dt);
      const flow = { ...st.flow };
      for (const [id, amps] of Object.entries(snapshot.wires)) {
        const mag = Math.abs(amps);
        if (mag < 1e-6) continue;
        const speed = 10 + 80 * Math.sqrt(Math.min(1, mag / 0.1));
        flow[id] = ((flow[id] ?? 0) + Math.sign(amps) * speed * dt) % 900;
      }
      st.set({ snapshot, flow });
      buzz(st.sound && Object.values(snapshot.parts).some((p) => p.sounding));
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable) return;
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
  const m = Math.floor(t / 60);
  const s = (t % 60).toFixed(1).padStart(4, "0");
  return (
    <span className="clock" aria-label="Simulated time">
      {String(m).padStart(2, "0")}:{s}
    </span>
  );
}

function Toast() {
  const toast = useStore((s) => s.toast);
  const set = useStore((s) => s.set);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => set({ toast: null }), 3200);
    return () => clearTimeout(id);
  }, [toast, set]);
  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      {toast && <div className="toast" key={toast.key}>{toast.text}</div>}
    </div>
  );
}

export default function Workbench() {
  useSimLoop();
  useShortcuts();
  const running = useStore((s) => s.running);
  const hasSnapshot = useStore((s) => !!s.snapshot);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const showFlow = useStore((s) => s.showFlow);
  const sound = useStore((s) => s.sound);
  const danger = useStore((s) => s.snapshot?.warnings.filter((w) => w.level !== "info").length ?? 0);
  const { set, undo, redo, setRunning, resetSim } = useStore.getState();
  const [sheet, setSheet] = useState<"parts" | "inspect" | null>(null);

  // Restore the last circuit after hydration so server and client markup match.
  useEffect(() => {
    const saved = loadSaved();
    if (saved) useStore.setState((s) => ({ doc: saved, fitTick: s.fitTick + 1 }));
  }, []);

  // On small screens, open the inspector when something gets selected.
  useEffect(
    () =>
      useStore.subscribe((s, prev) => {
        if (s.selection && s.selection !== prev.selection && window.matchMedia("(max-width: 900px)").matches) setSheet("inspect");
      }),
    [],
  );

  const toggleRun = () => {
    if (running) {
      setRunning(false);
      buzz(false);
    } else setRunning(true);
  };

  return (
    <div className="bench" data-sheet={sheet ?? "none"}>
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
          <button type="button" className="btn is-ghost" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" className="btn is-ghost" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">Redo</button>
          <span className="sep" />
          <button type="button" className="btn is-ghost toggle" aria-pressed={showFlow} onClick={() => set({ showFlow: !showFlow })}>
            <i /> Current flow
          </button>
          <button type="button" className="btn is-ghost toggle" aria-pressed={sound} onClick={() => { set({ sound: !sound }); if (sound) buzz(false); }}>
            <i /> Sound
          </button>
        </div>

        <div className="run">
          <Clock />
          {hasSnapshot && (
            <button type="button" className="btn" onClick={() => { resetSim(); buzz(false); }}>
              Reset
            </button>
          )}
          <button type="button" className={`btn is-primary run-btn${running ? " is-running" : ""}`} onClick={toggleRun}>
            <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden>
              {running ? <path d="M2 1h3v10H2zM7 1h3v10H7z" fill="currentColor" /> : <path d="M2.5 1l8 5-8 5z" fill="currentColor" />}
            </svg>
            {running ? "Pause" : "Run"}
          </button>
        </div>
      </header>

      <Drawer onPicked={() => setSheet(null)} />
      <main className="stage">
        <Canvas />
        <Toast />
      </main>
      <Inspector />

      <nav className="tabs" aria-label="Panels">
        <button type="button" aria-pressed={sheet === "parts"} onClick={() => setSheet(sheet === "parts" ? null : "parts")}>Parts</button>
        <button type="button" aria-pressed={sheet === "inspect"} onClick={() => setSheet(sheet === "inspect" ? null : "inspect")}>
          Inspect{danger > 0 && <em>{danger}</em>}
        </button>
      </nav>
    </div>
  );
}
