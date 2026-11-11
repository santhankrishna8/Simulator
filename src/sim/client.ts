import type { FromWorker, ToWorker } from "./worker";

type Frame = Extract<FromWorker, { t: "frame" }>;

/** Talks to the simulation worker. The worker is created on first use, in the browser only. */
export class SimClient {
  private worker: Worker | null = null;
  onFrame: (frame: Frame) => void = () => {};
  onError: (message: string) => void = () => {};

  private ensure(): Worker {
    if (!this.worker) {
      const w = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<FromWorker>) => {
        if (e.data.t === "frame") this.onFrame(e.data);
        else this.onError(e.data.message);
      };
      w.onerror = (e) => this.onError(e.message || "The simulation stopped unexpectedly.");
      this.worker = w;
    }
    return this.worker;
  }

  send(message: ToWorker) {
    this.ensure().postMessage(message);
  }
}

export const sim = new SimClient();
