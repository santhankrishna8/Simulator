"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { useStore } from "@/store";

const Plotter = dynamic(() => import("./Plotter"), { ssr: false });
const Editor = dynamic(() => import("./Editor"), {
  ssr: false,
  loading: () => <p className="muted dock-pad">Loading editor…</p>,
});

function BuildStatus() {
  const build = useStore((s) => s.build);
  const dirty = useStore((s) => s.builtCode !== null && s.builtCode !== s.code);
  if (build.status === "building") return <span className="build is-busy" role="status">Compiling…</span>;
  if (build.status === "error") {
    const n = build.diagnostics.filter((d) => d.severity === "error").length;
    return <span className="build is-bad" role="status">{n ? `${n} error${n > 1 ? "s" : ""}` : "Could not compile"}</span>;
  }
  if (build.status === "ok") {
    const text = build.flash !== undefined
      ? `${build.flash.toLocaleString("en")} of ${build.flashMax!.toLocaleString("en")} bytes flash · ${build.ram} of ${build.ramMax} bytes RAM`
      : "Ready (built-in program)";
    return <span className={`build ${dirty ? "is-stale" : "is-ok"}`} role="status">{dirty ? "Edited since upload" : text}</span>;
  }
  return <span className="build">Not uploaded</span>;
}

function Problems() {
  const build = useStore((s) => s.build);
  if (build.status !== "error") return null;
  return (
    <ul className="problems" aria-label="Compiler messages">
      {build.message && <li><span>{build.message}</span></li>}
      {build.diagnostics.map((d, i) => (
        <li key={i}>
          <b>{d.file === "sketch.ino" ? `Line ${d.line}` : d.file}</b>
          <span>{d.message}</span>
        </li>
      ))}
    </ul>
  );
}

function SerialMonitor() {
  const serial = useStore((s) => s.serial);
  const clear = useStore((s) => s.clearSerial);
  const send = useStore((s) => s.sendSerial);
  const baud = useStore((s) => s.snapshot?.parts && Object.values(s.snapshot.parts).find((p) => p.uno)?.uno?.baud);
  const running = useStore((s) => s.running);
  const [text, setText] = useState("");
  const [newline, setNewline] = useState(true);
  const [stick, setStick] = useState(true);
  const log = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = log.current;
    if (el && stick) el.scrollTop = el.scrollHeight;
  }, [serial, stick]);

  const submit = () => {
    if (!text && !newline) return;
    send(text + (newline ? "\n" : ""));
    setText("");
  };

  return (
    <div className="serial">
      <pre
        ref={log}
        className="serial-log"
        tabIndex={0}
        aria-label="Serial output"
        aria-live="off"
        onScroll={(e) => {
          const el = e.currentTarget;
          setStick(el.scrollTop + el.clientHeight >= el.scrollHeight - 24);
        }}
      >
        {serial || <span className="muted">{running ? "Waiting for the sketch to print something with Serial.println()…" : "Run the sketch to see what it prints."}</span>}
      </pre>
      <form
        className="serial-send"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type a message for the sketch" aria-label="Message to send" spellCheck={false} />
        <button type="submit" className="btn" disabled={!running}>Send</button>
        <label className="check">
          <input type="checkbox" checked={newline} onChange={(e) => setNewline(e.target.checked)} /> Add newline
        </label>
        <button type="button" className="btn is-ghost" onClick={clear}>Clear</button>
        {baud ? <span className="baud">{baud.toLocaleString("en")} baud</span> : null}
      </form>
    </div>
  );
}

let warmed = false;

export default function Dock() {
  const tab = useStore((s) => s.dockTab);
  const height = useStore((s) => s.dockH);
  const set = useStore((s) => s.set);
  const upload = useStore((s) => s.upload);
  const building = useStore((s) => s.build.status === "building");
  const unread = useStore((s) => s.serial.length > 0);
  const drag = useRef<{ y: number; h: number } | null>(null);

  // Wake a sleeping compile service while the person reads or types. Once per visit.
  useEffect(() => {
    if (warmed) return;
    warmed = true;
    fetch("/api/compile").catch(() => {});
  }, []);

  return (
    <section className="dock" style={{ "--dock-h": `${height}px` } as React.CSSProperties} aria-label="Code and serial monitor">
      <div
        className="dock-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize panel"
        tabIndex={0}
        onPointerDown={(e) => {
          drag.current = { y: e.clientY, h: height };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (drag.current) set({ dockH: Math.round(Math.min(window.innerHeight * 0.75, Math.max(160, drag.current.h + drag.current.y - e.clientY))) });
        }}
        onPointerUp={() => (drag.current = null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp") set({ dockH: Math.min(Math.round(window.innerHeight * 0.75), height + 40) });
          if (e.key === "ArrowDown") set({ dockH: Math.max(160, height - 40) });
        }}
      />
      <div className="dock-head">
        <div className="seg" role="tablist" aria-label="Panel">
          <button type="button" role="tab" aria-selected={tab === "code"} onClick={() => set({ dockTab: "code" })}>Code</button>
          <button type="button" role="tab" aria-selected={tab === "serial"} onClick={() => set({ dockTab: "serial" })}>
            Serial monitor{unread && tab !== "serial" && tab !== "plotter" && <i className="dot" aria-label="has output" />}
          </button>
          <button type="button" role="tab" aria-selected={tab === "plotter"} onClick={() => set({ dockTab: "plotter" })}>Plotter</button>
        </div>
        <BuildStatus />
        <div className="dock-actions">
          <button type="button" className="btn is-primary" onClick={() => void upload()} disabled={building}>
            {building ? "Compiling…" : "Upload and run"}
          </button>
          <button type="button" className="btn is-ghost" onClick={() => set({ dockOpen: false })} aria-label="Close panel">Close</button>
        </div>
      </div>
      <div className="dock-body">
        {tab === "code" ? (
          <>
            <div className="editor"><Editor /></div>
            <Problems />
          </>
        ) : tab === "serial" ? (
          <SerialMonitor />
        ) : (
          <Plotter />
        )}
      </div>
    </section>
  );
}
