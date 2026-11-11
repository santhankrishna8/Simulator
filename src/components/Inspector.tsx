"use client";

import { useState } from "react";
import { BATTERIES, CATALOG, LED_COLORS, formatSI, parseSI, type PropDef } from "@/sim/catalog";
import type { Warning } from "@/sim/engine";
import { EXAMPLES, type Example } from "@/sim/examples";
import { WIRE_COLORS, ldrOhms, type Part } from "@/sim/model";
import { useStore } from "@/store";

const OHM_CHIPS = [100, 220, 470, 1000, 10000, 100000];
const FARAD_CHIPS = [1e-6, 1e-5, 1e-4, 1e-3];

function ValueField({ part, def, unit, chips }: { part: Part; def: PropDef; unit: string; chips: number[] }) {
  const setProp = useStore((s) => s.setProp);
  const value = Number(part.props[def.key]);
  // `draft` holds what is being typed; null means "show the stored value".
  const [draft, setDraft] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const text = draft ?? formatSI(value, unit);
  const setText = setDraft;
  const apply = () => {
    const v = parseSI(text);
    if (v === null) return setBad(true);
    setBad(false);
    setDraft(null);
    if (v !== value) setProp(part.id, def.key, v);
  };
  return (
    <div className="field">
      <label htmlFor={`f-${def.key}`}>{def.label}</label>
      <input
        id={`f-${def.key}`}
        className={bad ? "is-bad" : ""}
        value={text}
        spellCheck={false}
        aria-invalid={bad}
        aria-describedby={bad ? `e-${def.key}` : undefined}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
      {bad && <p className="field-error" id={`e-${def.key}`}>Type a value like 220, 4.7k or 1M.</p>}
      <div className="chips">
        {chips.map((c) => (
          <button key={c} type="button" className={c === value ? "chip is-on" : "chip"} onClick={() => { setDraft(null); setBad(false); setProp(part.id, def.key, c); }}>
            {formatSI(c, unit)}
          </button>
        ))}
      </div>
    </div>
  );
}

function PropControl({ part, def }: { part: Part; def: PropDef }) {
  const setProp = useStore((s) => s.setProp);
  if (def.kind === "ohms") return <ValueField part={part} def={def} unit="Ω" chips={OHM_CHIPS} />;
  if (def.kind === "farads") return <ValueField part={part} def={def} unit="F" chips={FARAD_CHIPS} />;
  if (def.kind === "range") {
    const t = Number(part.props[def.key]);
    const min = def.min ?? 0, max = def.max ?? 1, step = def.step ?? 0.005;
    return (
      <div className="field">
        <label htmlFor={`f-${def.key}`}>
          {def.label}
          {def.unit && <span className="val">{t} {def.unit}</span>}
        </label>
        <input
          id={`f-${def.key}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={t}
          onChange={(e) => setProp(part.id, def.key, Number(e.target.value), false)}
        />
        <div className="range-ends">
          <span>{def.lowLabel}</span>
          <span>{def.highLabel}</span>
        </div>
      </div>
    );
  }
  const current = String(part.props[def.key]);
  const isLed = part.type === "led";
  return (
    <div className="field">
      <span className="label">{def.label}</span>
      <div className="chips" role="radiogroup" aria-label={def.label}>
        {def.options!.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === current}
            className={o.value === current ? "chip is-on" : "chip"}
            onClick={() => setProp(part.id, def.key, o.value)}
          >
            {isLed && <i style={{ background: LED_COLORS[o.value].lit }} />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function WarningCard({ w }: { w: Warning }) {
  const select = useStore((s) => s.select);
  return (
    <li className={`warning is-${w.level}`}>
      <button type="button" disabled={!w.part} onClick={() => w.part && select({ kind: "part", id: w.part })}>
        <b>{w.title}</b>
        <span>{w.why}</span>
        <span className="fix">{w.fix}</span>
      </button>
    </li>
  );
}

function UnoPins({ part }: { part: Part }) {
  const uno = useStore((s) => s.snapshot?.parts[part.id]?.uno);
  if (!uno) return null;
  const rows = Object.entries(uno.pins).filter(([, p]) => p.mode !== "off");
  const label: Record<string, string> = { high: "Output HIGH", low: "Output LOW", input: "Input", pullup: "Input, pull-up" };
  return (
    <>
      <dl className="readings">
        <div><dt>Board</dt><dd>{!uno.powered ? "No power" : uno.inReset ? "In reset" : uno.running ? "Running" : "Idle"}</dd></div>
        {uno.baud > 0 && <div><dt>Serial</dt><dd>{uno.baud.toLocaleString("en")} baud</dd></div>}
      </dl>
      {rows.length > 0 && (
        <table className="pins">
          <thead><tr><th>Pin</th><th>Mode</th><th>Volts</th></tr></thead>
          <tbody>
            {rows.map(([id, p]) => (
              <tr key={id}>
                <td>{id.toUpperCase()}</td>
                <td>{label[p.mode]}</td>
                <td>{formatSI(Math.abs(p.v) < 5e-4 ? 0 : p.v, "V", 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function Readings({ part }: { part: Part }) {
  const live = useStore((s) => s.snapshot?.parts[part.id]);
  if (!live) return <p className="muted">Press Run to see live voltage and current.</p>;
  if (part.type === "uno") return <UnoPins part={part} />;
  if (live.extra) {
    return (
      <dl className="readings">
        {Object.entries(live.extra).map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
    );
  }
  const rows: [string, string][] = [];
  const isBattery = part.type in BATTERIES;
  if (part.type === "meter") rows.push(["Reading", live.reading ?? "–"]);
  else {
    rows.push([part.type === "pot" ? "Wiper voltage" : isBattery ? "Terminal voltage" : "Voltage across", formatSI(Math.abs(live.v) < 5e-4 ? 0 : live.v, "V")]);
    rows.push([isBattery ? "Current supplied" : "Current", formatSI(Math.abs(live.i) < 5e-7 ? 0 : live.i, "A")]);
    if (!["button", "switch"].includes(part.type)) rows.push(["Power", formatSI(Math.abs(live.p) < 1e-6 ? 0 : Math.abs(live.p), "W")]);
  }
  if (isBattery) rows.push(["Charge used", `${(live.usedMah ?? 0).toFixed(3)} of ${BATTERIES[part.type].capacityMah} mAh`]);
  if (part.type === "motor") rows.push(["Speed", `${Math.round(live.rpm ?? 0).toLocaleString("en")} rpm`]);
  if (part.type === "ldr") rows.push(["Resistance now", formatSI(ldrOhms(Number(part.props.t)), "Ω")]);
  return (
    <dl className="readings">
      {rows.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function PartPanel({ part }: { part: Part }) {
  const def = CATALOG[part.type];
  const rotate = useStore((s) => s.rotateSelected);
  const del = useStore((s) => s.deleteSelected);
  const replace = useStore((s) => s.replacePart);
  const burned = useStore((s) => s.snapshot?.parts[part.id]?.burned);
  const warnings = useStore((s) => s.snapshot?.warnings) ?? [];
  const mine = warnings.filter((w) => w.part === part.id);
  return (
    <>
      <div className="panel-head">
        <h2>{def.name}</h2>
        <div className="row">
          {part.type !== "breadboard" && (
            <button type="button" className="btn" onClick={rotate}>
              Rotate <kbd>R</kbd>
            </button>
          )}
          <button type="button" className="btn" onClick={del}>
            Delete <kbd>Del</kbd>
          </button>
        </div>
      </div>
      <div className="panel-body">
        {mine.length > 0 && (
          <ul className="warnings">
            {mine.map((w) => (
              <WarningCard key={w.id} w={w} />
            ))}
          </ul>
        )}
        {burned && (
          <button type="button" className="btn is-primary is-wide" onClick={() => replace(part.id)}>
            Fit a new {def.name.toLowerCase()}
          </button>
        )}
        {def.props.map((p) => (
          <PropControl key={p.key} part={part} def={p} />
        ))}
        {part.type !== "breadboard" && (
          <section>
            <h3>Live</h3>
            <Readings part={part} />
          </section>
        )}
        <section className="learn">
          <h3>What it does</h3>
          <p>{def.learn.what}</p>
          <h3>How to wire it</h3>
          <p>{def.learn.wiring}</p>
          <h3>Limits</h3>
          <p>{def.learn.limits}</p>
        </section>
      </div>
    </>
  );
}

function WirePanel({ id }: { id: string }) {
  const wire = useStore((s) => s.doc.wires.find((w) => w.id === id));
  const amps = useStore((s) => s.snapshot?.wires[id]);
  const setColor = useStore((s) => s.setWireColor);
  const del = useStore((s) => s.deleteSelected);
  if (!wire) return null;
  return (
    <>
      <div className="panel-head">
        <h2>Jumper wire</h2>
        <div className="row">
          <button type="button" className="btn" onClick={del}>
            Delete <kbd>Del</kbd>
          </button>
        </div>
      </div>
      <div className="panel-body">
        <div className="field">
          <span className="label">Colour</span>
          <div className="swatches" role="radiogroup" aria-label="Wire colour">
            {WIRE_COLORS.map((c) => (
              <button key={c} type="button" role="radio" aria-checked={c === wire.color} aria-label={c} className={c === wire.color ? "is-on" : ""} style={{ background: c }} onClick={() => setColor(id, c)} />
            ))}
          </div>
        </div>
        <section>
          <h3>Live</h3>
          {amps === undefined ? (
            <p className="muted">Press Run to see the current in this wire.</p>
          ) : (
            <dl className="readings">
              <div>
                <dt>Current</dt>
                <dd>{formatSI(Math.abs(amps) < 5e-7 ? 0 : Math.abs(amps), "A")}</dd>
              </div>
            </dl>
          )}
        </section>
        <section className="learn">
          <h3>Colour is a habit, not a rule</h3>
          <p>Electricity does not care about colour, but people do. Red for positive and black for negative makes mistakes easy to spot.</p>
        </section>
      </div>
    </>
  );
}

function ExampleList({ title, items, onPick }: { title: string; items: Example[]; onPick: (e: Example) => void }) {
  return (
    <section>
      <h3>{title}</h3>
      <ul className="examples">
        {items.map((ex) => (
          <li key={ex.id}>
            <button type="button" onClick={() => onPick(ex)}>
              <b>{ex.title}</b>
              <span>{ex.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Overview() {
  const running = useStore((s) => s.running);
  const snapshot = useStore((s) => s.snapshot);
  const loadExample = useStore((s) => s.loadExample);
  const warnings = snapshot?.warnings ?? [];
  return (
    <>
      <div className="panel-head">
        <h2>Circuit check</h2>
      </div>
      <div className="panel-body">
        {!snapshot ? (
          <p className="muted">Press Run and the bench checks your circuit as it works: shorts, overloads and parts in backwards.</p>
        ) : warnings.length ? (
          <ul className="warnings">
            {warnings.map((w) => (
              <WarningCard key={w.id} w={w} />
            ))}
          </ul>
        ) : (
          <p className="ok">{running ? "Everything is within its limits." : "Paused. Nothing was over its limits."}</p>
        )}
        <ExampleList title="Circuits" items={EXAMPLES.filter((e) => !e.sketch)} onPick={loadExample} />
        <ExampleList title="Arduino sketches" items={EXAMPLES.filter((e) => e.sketch)} onPick={loadExample} />
        <section className="learn">
          <h3>Using the bench</h3>
          <p>Click a pin or hole, then another, to run a wire. Hover any hole to see which holes it is joined to, and its voltage while running.</p>
        </section>
      </div>
    </>
  );
}

export default function Inspector() {
  const selection = useStore((s) => s.selection);
  const part = useStore((s) => (selection?.kind === "part" ? s.doc.parts.find((p) => p.id === selection.id) : undefined));
  return (
    <aside className="inspector" aria-label="Inspector">
      {part ? <PartPanel key={part.id} part={part} /> : selection?.kind === "wire" ? <WirePanel id={selection.id} /> : <Overview />}
    </aside>
  );
}
