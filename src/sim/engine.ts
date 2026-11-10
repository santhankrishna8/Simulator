import { BATTERIES, formatSI } from "./catalog";
import { compile, type Compiled, type Doc, type PinRef, type Runtime } from "./model";
import { currentOf, makeState, solve } from "./solver";

export interface PartLive {
  /** Voltage across the part's main terminals. */
  v: number;
  /** Current through the part, in amps. */
  i: number;
  /** Power dissipated (or delivered, for batteries), in watts. */
  p: number;
  burned?: boolean;
  /** 0..1 light output for LEDs. */
  glow?: number;
  /** Motor shaft angle in radians and speed in rpm. */
  angle?: number;
  rpm?: number;
  /** Buzzer sounding. */
  sounding?: boolean;
  /** Battery charge used so far, mAh. */
  usedMah?: number;
  /** Multimeter reading text. */
  reading?: string;
}

export interface Warning {
  id: string;
  level: "danger" | "warn" | "info";
  part?: string;
  title: string;
  why: string;
  fix: string;
}

export interface Snapshot {
  time: number;
  parts: Record<string, PartLive>;
  /** Signed current per wire id, positive from end a to end b. */
  wires: Record<string, number>;
  warnings: Warning[];
  voltageAt(ref: PinRef): number | undefined;
}

const DT = 0.0002;
const MAX_STEPS = 120;

// Hobby "130" motor constants.
const MOTOR_K = 0.00286; // V·s/rad and N·m/A
const MOTOR_J = 1e-6; // kg·m², rotor plus a small propeller
const MOTOR_B = 3.4e-7; // viscous friction

export class Engine {
  time = 0;
  private burned = new Set<string>();
  private stress = new Map<string, number>();
  private heat = new Map<string, number>();
  private omega = new Map<string, number>();
  private angle = new Map<string, number>();
  private usedMah = new Map<string, number>();
  private capV = new Map<string, number>();
  private diodeV = new Map<string, number>();

  reset() {
    this.time = 0;
    this.burned.clear();
    this.stress.clear();
    this.heat.clear();
    this.omega.clear();
    this.angle.clear();
    this.usedMah.clear();
    this.capV.clear();
    this.diodeV.clear();
  }

  /** Swap a burnt part for a fresh one. */
  replace(partId: string) {
    this.burned.delete(partId);
    this.stress.delete(partId);
    this.heat.delete(partId);
  }

  /** Advance the simulation by `seconds` of circuit time. */
  advance(doc: Doc, pressed: Set<string>, seconds: number): Snapshot {
    const emf = new Map<string, number>();
    this.omega.forEach((w, id) => emf.set(id, MOTOR_K * w));
    const rt: Runtime = { pressed, burned: this.burned, emf };
    let c: Compiled = compile(doc, rt);
    let state = makeState(c.elems);
    const load = () => {
      c.elems.forEach((e, idx) => {
        if (e.k === "C") state.vc[idx] = this.capV.get(e.part) ?? 0;
        if (e.k === "D") state.vd[idx] = this.diodeV.get(e.part) ?? 0;
      });
    };
    load();

    const steps = Math.max(1, Math.min(MAX_STEPS, Math.round(seconds / DT)));
    const dt = seconds > 0 ? seconds / steps : DT;
    let v: Float64Array = new Float64Array(c.nodeCount);
    const partI = new Map<string, number>();
    const wireI: Record<string, number> = {};

    for (let s = 0; s < steps; s++) {
      const vcPrev = Float64Array.from(state.vc);
      v = solve(c.nodeCount, c.elems, state, dt);
      this.time += dt;
      let burnedNow = false;

      c.elems.forEach((e, idx) => {
        const i = currentOf(e, idx, v, state, dt, vcPrev[idx]);
        if (e.k === "W") {
          wireI[e.wire] = i;
          return;
        }
        if (e.k === "R" && e.tag) {
          if (e.tag !== "upper") return;
        }
        const id = e.part!;
        partI.set(id, i);
        const part = doc.parts.find((p) => p.id === id)!;

        if (e.k === "C") this.capV.set(id, state.vc[idx]);
        if (e.k === "D") this.diodeV.set(id, state.vd[idx]);

        if (part.type === "led") {
          // Overcurrent stress: instant failure past 120 mA, slower above 30 mA.
          let st = this.stress.get(id) ?? 0;
          if (i > 0.03) st += (i - 0.03) * dt;
          else st = Math.max(0, st - 0.01 * dt);
          this.stress.set(id, st);
          if (i > 0.12 || st > 0.06) {
            this.burned.add(id);
            burnedNow = true;
          }
        } else if (part.type === "resistor") {
          const p = e.k === "R" ? i * i * e.r : 0;
          let h = this.heat.get(id) ?? 0;
          if (p > 0.25) h += (p - 0.25) * dt;
          else h = Math.max(0, h - 0.2 * dt);
          this.heat.set(id, h);
          if (h > 1.5) {
            this.burned.add(id);
            burnedNow = true;
          }
        } else if (part.type === "motor" && e.k === "V") {
          let w = this.omega.get(id) ?? 0;
          const torque = MOTOR_K * i - MOTOR_B * w;
          w += (torque / MOTOR_J) * dt;
          this.omega.set(id, w);
          this.angle.set(id, ((this.angle.get(id) ?? 0) + w * dt) % (Math.PI * 2));
          e.v = MOTOR_K * w;
        } else if (part.type in BATTERIES) {
          const out = -i;
          this.usedMah.set(id, (this.usedMah.get(id) ?? 0) + (Math.max(0, out) * dt * 1000) / 3600);
        }
      });

      if (burnedNow) {
        // A part just failed open; rebuild the netlist without it.
        c = compile(doc, rt);
        state = makeState(c.elems);
        load();
      }
    }

    const parts: Record<string, PartLive> = {};
    const warnings: Warning[] = [];
    const nv = (partId: string, pin: string) => {
      const n = c.nodeOf.get(`${partId}.${pin}`);
      return n === undefined ? 0 : (v[n] ?? 0);
    };

    for (const part of doc.parts) {
      const id = part.id;
      const i = partI.get(id) ?? 0;
      const burned = this.burned.has(id);
      switch (part.type) {
        case "breadboard":
          break;
        case "battery9v":
        case "batteryAA2":
        case "batteryAA4":
        case "coincell": {
          const spec = BATTERIES[part.type];
          const vt = nv(id, "pos") - nv(id, "neg");
          const out = -i;
          parts[id] = { v: vt, i: out, p: vt * out, usedMah: this.usedMah.get(id) ?? 0 };
          if (out > spec.shortAmps) {
            warnings.push({
              id: `short-${id}`,
              level: "danger",
              part: id,
              title: "Short circuit",
              why: `The battery is pushing ${formatSI(out, "A")} with almost nothing to limit it. Its voltage has collapsed to ${formatSI(vt, "V")}. A real battery would get hot and drain in minutes.`,
              fix: "Find the path that joins + straight to − and put a load, such as a resistor and LED, in it.",
            });
          }
          break;
        }
        case "resistor": {
          const vd = nv(id, "a") - nv(id, "b");
          const p = burned ? 0 : Math.abs(vd * i);
          parts[id] = { v: vd, i: burned ? 0 : i, p, burned };
          if (burned) {
            warnings.push({
              id: `rburn-${id}`,
              level: "danger",
              part: id,
              title: "Resistor burnt out",
              why: "It carried far more than its ¼ W rating until it failed. It no longer conducts.",
              fix: "Replace it and use a higher resistance, or lower the supply voltage.",
            });
          } else if (p > 0.25) {
            warnings.push({
              id: `rhot-${id}`,
              level: "warn",
              part: id,
              title: "Resistor overheating",
              why: `It is dissipating ${formatSI(p, "W")}, above its ¼ W rating. Power is voltage × current: ${formatSI(Math.abs(vd), "V")} × ${formatSI(Math.abs(i), "A")}.`,
              fix: "Use a higher resistance so less current flows.",
            });
          }
          break;
        }
        case "led": {
          const vd = nv(id, "anode") - nv(id, "cathode");
          const cur = burned ? 0 : Math.max(0, i);
          parts[id] = { v: vd, i: cur, p: vd * cur, burned, glow: Math.min(1, Math.pow(cur / 0.02, 0.6)) };
          if (burned) {
            warnings.push({
              id: `lburn-${id}`,
              level: "danger",
              part: id,
              title: "LED burnt out",
              why: "Too much current flowed through it. An LED has almost no resistance of its own once it turns on, so something else must limit the current.",
              fix: "Replace the LED and add a resistor in series. 220 Ω to 1 kΩ suits most batteries.",
            });
          } else if (cur > 0.03) {
            warnings.push({
              id: `lhot-${id}`,
              level: "warn",
              part: id,
              title: "LED over its limit",
              why: `${formatSI(cur, "A")} is flowing. A standard LED is rated for about 20 mA and will fail soon at this level.`,
              fix: "Increase the series resistor.",
            });
          } else if (vd < -1) {
            warnings.push({
              id: `lrev-${id}`,
              level: "info",
              part: id,
              title: "LED is in backwards",
              why: "The voltage is pushing from the short leg to the long leg. An LED only conducts from anode (long leg) to cathode.",
              fix: "Turn the LED around.",
            });
          }
          break;
        }
        case "diode": {
          const vd = nv(id, "anode") - nv(id, "cathode");
          parts[id] = { v: vd, i: Math.max(0, i), p: vd * Math.max(0, i) };
          break;
        }
        case "capacitor": {
          const vc = nv(id, "pos") - nv(id, "neg");
          parts[id] = { v: vc, i, p: vc * i };
          if (vc < -1) {
            warnings.push({
              id: `crev-${id}`,
              level: "warn",
              part: id,
              title: "Capacitor is reversed",
              why: "An electrolytic capacitor must have its + leg at the higher voltage. Reversed, a real one heats up and can burst.",
              fix: "Turn the capacitor around so the stripe faces the negative side.",
            });
          } else if (vc > 16) {
            warnings.push({
              id: `cover-${id}`,
              level: "warn",
              part: id,
              title: "Capacitor over its voltage rating",
              why: `It has ${formatSI(vc, "V")} across it and is rated for 16 V.`,
              fix: "Lower the supply voltage.",
            });
          }
          break;
        }
        case "button":
        case "switch":
          parts[id] = { v: 0, i, p: 0 };
          break;
        case "pot": {
          const va = nv(id, "a") - nv(id, "b");
          parts[id] = { v: nv(id, "w") - nv(id, "b"), i, p: Math.abs(va * i) };
          if (Math.abs(va * i) > 0.2) {
            warnings.push({
              id: `pothot-${id}`,
              level: "warn",
              part: id,
              title: "Potentiometer overloaded",
              why: "Its track is thin and rated for about 0.1 W. With the knob near one end, nearly all the current passes through a tiny piece of track.",
              fix: "Add a fixed resistor in series, or use the potentiometer only to set a voltage.",
            });
          }
          break;
        }
        case "ldr": {
          const vd = nv(id, "a") - nv(id, "b");
          parts[id] = { v: vd, i, p: Math.abs(vd * i) };
          break;
        }
        case "buzzer": {
          const vd = nv(id, "pos") - nv(id, "neg");
          parts[id] = { v: vd, i, p: Math.abs(vd * i), sounding: vd > 1.5 };
          if (vd < -1.5) {
            warnings.push({
              id: `bzrev-${id}`,
              level: "info",
              part: id,
              title: "Buzzer is in backwards",
              why: "An active buzzer only works with its + pin toward positive.",
              fix: "Turn the buzzer around.",
            });
          }
          break;
        }
        case "motor": {
          const vd = nv(id, "pos") - nv(id, "neg");
          const w = this.omega.get(id) ?? 0;
          parts[id] = { v: vd, i, p: vd * i, angle: this.angle.get(id) ?? 0, rpm: (w * 60) / (2 * Math.PI) };
          break;
        }
        case "meter": {
          const vd = nv(id, "v") - nv(id, "com");
          const amps = part.props.mode === "A";
          const value = amps ? i : vd;
          parts[id] = { v: vd, i, p: 0, reading: formatSI(Math.abs(value) < (amps ? 1e-6 : 1e-4) ? 0 : value, amps ? "A" : "V", 4) };
          break;
        }
      }
    }

    const batteries = doc.parts.filter((p) => p.type in BATTERIES);
    if (batteries.length && !warnings.length && doc.parts.length > 1) {
      const idle = batteries.every((b) => Math.abs(parts[b.id]?.i ?? 0) < 1e-6);
      if (idle) {
        warnings.push({
          id: "open",
          level: "info",
          title: "No current is flowing",
          why: "Current needs a complete loop: out of the battery's + terminal, through your parts, and back to −.",
          fix: "Trace the path with your finger. Look for a gap, an open switch, or a part in backwards.",
        });
      }
    }

    const compiled = c;
    const volts = v;
    return {
      time: this.time,
      parts,
      wires: wireI,
      warnings,
      voltageAt(ref) {
        const n = compiled.node(ref);
        return n === undefined ? undefined : volts[n];
      },
    };
  }
}
