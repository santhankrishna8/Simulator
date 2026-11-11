"use client";

import { useMemo, useRef } from "react";
import { buildGuide } from "@/build/guide";
import { useStore } from "@/store";
import BenchDiagram from "./BenchDiagram";
import { useModal } from "./useModal";

export default function BuildGuide() {
  const open = useStore((s) => s.guideOpen);
  const doc = useStore((s) => s.doc);
  const code = useStore((s) => s.code);
  const { openGuide } = useStore.getState();
  const ref = useRef<HTMLDivElement>(null);
  useModal(ref, open, () => openGuide(false));
  const guide = useMemo(() => (open ? buildGuide(doc) : null), [open, doc]);
  if (!open || !guide) return null;
  const hasBoard = doc.parts.some((p) => p.type === "uno");
  const empty = !doc.parts.some((p) => p.type !== "breadboard");

  return (
    <div className="modal-back guide-back" onPointerDown={(e) => e.target === e.currentTarget && openGuide(false)}>
      <div className="modal guide" role="dialog" aria-modal="true" aria-labelledby="guide-title" ref={ref}>
        <header className="no-print">
          <div>
            <h2 id="guide-title">Build it for real</h2>
            <p>A shopping list and step-by-step guide for the circuit on your bench. Print it, or save it as a PDF from the print window.</p>
          </div>
          <div className="row">
            <button type="button" className="btn is-primary" onClick={() => window.print()} disabled={empty}>Print</button>
            <button type="button" className="btn" onClick={() => openGuide(false)}>Close</button>
          </div>
        </header>
        <div className="modal-body guide-body">
          {empty ? (
            <p className="muted">Put some parts on the bench first, then come back. The guide is made from what is there.</p>
          ) : (
            <>
              <h1 className="print-only">Build guide</h1>
              <section>
                <h3>The circuit</h3>
                <BenchDiagram doc={doc} />
              </section>
              <section>
                <h3>1. What you need</h3>
                <table className="guide-table">
                  <thead><tr><th>Qty</th><th>Part</th><th>Notes</th></tr></thead>
                  <tbody>
                    {guide.bom.map((b) => (
                      <tr key={b.name}><td>{b.qty}</td><td>{b.name}</td><td>{b.note}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
              <section>
                <h3>2. Place the parts</h3>
                <p className="muted">Put the breadboard in front of you. Columns are numbered 1 to 30 from left to right. The rows above the centre gap are a to e and the rows below it are f to j, so &ldquo;f9&rdquo; is column 9, row f. Each column of five holes is joined inside the board.</p>
                <table className="guide-table">
                  <tbody>
                    {guide.placements.map((p, i) => (
                      <tr key={i}><td><span className="box" aria-hidden /> {p.part}</td><td>{p.legs}</td></tr>
                    ))}
                  </tbody>
                </table>
              </section>
              {guide.wires.length > 0 && (
                <section>
                  <h3>3. Add the wires</h3>
                  <table className="guide-table">
                    <thead><tr><th>#</th><th>From</th><th>To</th><th>Colour</th></tr></thead>
                    <tbody>
                      {guide.wires.map((w) => (
                        <tr key={w.n}><td><span className="box" aria-hidden /> {w.n}</td><td>{w.from}</td><td>{w.to}</td><td>{w.color}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              )}
              {hasBoard && code.trim() && (
                <section>
                  <h3>4. Upload the sketch</h3>
                  <p className="muted">Connect the Arduino with the USB cable, open the Arduino IDE, paste this in, choose &ldquo;Arduino Uno&rdquo; as the board, and press Upload.</p>
                  <pre className="guide-code">{code}</pre>
                </section>
              )}
              <section>
                <h3>Check before you power it on</h3>
                <ul className="guide-checks">{guide.checks.map((c) => <li key={c}>{c}</li>)}</ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
