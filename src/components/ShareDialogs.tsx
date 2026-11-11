"use client";

import { useEffect, useRef, useState } from "react";
import { decodeProject, encodeProject, projectFile, readProjectFile } from "@/share/codec";
import { CATALOG } from "@/sim/catalog";
import { useStore } from "@/store";
import { useModal } from "./useModal";

const LONG_LINK = 12_000;

function ShareDialog() {
  const open = useStore((s) => s.shareOpen);
  const doc = useStore((s) => s.doc);
  const code = useStore((s) => s.code);
  const hasBoard = doc.parts.some((p) => p.type === "uno");
  const { openShare, offerProject, say, openGuide } = useStore.getState();
  const ref = useRef<HTMLDivElement>(null);
  const [link, setLink] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState("");
  useModal(ref, open, () => openShare(false));

  // Build the link whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    let live = true;
    encodeProject({ doc, code: hasBoard ? code : "" }).then((enc) => {
      if (!live) return;
      setLink(`${window.location.origin}${window.location.pathname}#share=${enc}`);
      setCopied(false);
      setProblem("");
    });
    return () => {
      live = false;
    };
  }, [open, doc, code, hasBoard]);

  if (!open) return null;
  const long = link.length > LONG_LINK;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      ref.current?.querySelector<HTMLInputElement>("input[readonly]")?.select();
      say("Press Ctrl+C to copy the link.");
    }
  };

  const download = () => {
    const blob = new Blob([projectFile({ doc, code: hasBoard ? code : "" })], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-circuit.simulator.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 500_000) return setProblem("That file is too large to be a project.");
    const result = readProjectFile(await file.text());
    if (!result.ok) return setProblem(result.error);
    offerProject({ project: result.project, source: "file", dropped: result.dropped });
  };

  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && openShare(false)}>
      <div className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="share-title" ref={ref}>
        <header>
          <div>
            <h2 id="share-title">Share this circuit</h2>
            <p>Anyone with the link gets their own copy of your bench{hasBoard ? " and sketch" : ""}. It does not include your lesson progress or anything else.</p>
          </div>
          <button type="button" className="btn" onClick={() => openShare(false)}>Close</button>
        </header>
        <div className="modal-body share-body">
          <label htmlFor="share-link">Link</label>
          <div className="share-row">
            <input id="share-link" readOnly value={link || "Preparing…"} onFocus={(e) => e.currentTarget.select()} />
            <button type="button" className="btn is-primary" onClick={() => void copy()} disabled={!link}>{copied ? "Copied" : "Copy"}</button>
          </div>
          {long && <p className="share-warn">This link is {link.length.toLocaleString("en")} characters long. Some chat apps cut long links, so a file is safer for a bench this big.</p>}
          <div className="share-actions">
            <button type="button" className="btn" onClick={download}>Download as a file</button>
            <label className="btn file-btn">
              Open a file…
              <input type="file" accept=".json,application/json" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
          </div>
          {problem && <p className="share-error" role="alert">{problem}</p>}
          <hr />
          <h3 className="share-sub">Build it for real</h3>
          <p className="muted">A printable shopping list, step-by-step placement and wiring with breadboard positions, and safety checks.</p>
          <div className="share-actions">
            <button type="button" className="btn" onClick={() => openGuide(true)}>Open the build guide</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Asks before opening anything that arrived from outside. */
function IncomingDialog() {
  const incoming = useStore((s) => s.incoming);
  const { offerProject, acceptIncoming } = useStore.getState();
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, !!incoming, () => offerProject(null));
  if (!incoming) return null;

  const { project, dropped, source } = incoming;
  const counts = new Map<string, number>();
  for (const p of project.doc.parts) if (p.type !== "breadboard") counts.set(CATALOG[p.type].name, (counts.get(CATALOG[p.type].name) ?? 0) + 1);
  const summary = [...counts].map(([n, c]) => (c > 1 ? `${c} × ${n}` : n)).join(", ") || "a bare breadboard";
  return (
    <div className="modal-back">
      <div className="modal modal-small" role="dialog" aria-modal="true" aria-labelledby="incoming-title" ref={ref}>
        <header>
          <div>
            <h2 id="incoming-title">Open {source === "link" ? "a shared circuit" : "this file"}?</h2>
            <p>It will replace what is on your bench now. Undo brings your bench back; your current sketch is not kept, so copy it first if you want it.</p>
          </div>
        </header>
        <div className="modal-body share-body">
          <dl className="share-facts">
            <div><dt>Parts</dt><dd>{summary}</dd></div>
            <div><dt>Wires</dt><dd>{project.doc.wires.length}</dd></div>
            <div><dt>Sketch</dt><dd>{project.code.trim() ? `${project.code.split("\n").length} lines` : "none"}</dd></div>
          </dl>
          {dropped.length > 0 && <p className="share-warn">{dropped.length} item{dropped.length > 1 ? "s were" : " was"} left out because the simulator does not recognise {dropped.length > 1 ? "them" : "it"}.</p>}
          <p className="muted">Nothing runs until you press Run. A sketch is only compiled when you press Upload.</p>
          <div className="share-actions">
            <button type="button" className="btn is-primary" onClick={acceptIncoming}>Open it</button>
            <button type="button" className="btn" onClick={() => offerProject(null)}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Opens a #share= link, from page load or a pasted link in the same tab. */
export function useShareLinks() {
  useEffect(() => {
    const check = async () => {
      const m = /^#share=(.+)$/.exec(window.location.hash);
      if (!m) return;
      history.replaceState(null, "", window.location.pathname + window.location.search);
      const result = await decodeProject(m[1]);
      const { offerProject, say } = useStore.getState();
      if (result.ok) offerProject({ project: result.project, source: "link", dropped: result.dropped });
      else say(result.error);
    };
    void check();
    window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, []);
}

export default function ShareDialogs() {
  return (
    <>
      <ShareDialog />
      <IncomingDialog />
    </>
  );
}
