let ctx: AudioContext | null = null;
let gain: GainNode | null = null;

/** Turn the buzzer tone on or off. Must first be called from a user gesture. */
export function buzz(on: boolean) {
  if (!on && !ctx) return;
  try {
    if (!ctx) {
      ctx = new AudioContext();
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 2300;
      gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
    }
    if (ctx.state === "suspended") void ctx.resume();
    gain!.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.004);
  } catch {
    /* audio unavailable */
  }
}
