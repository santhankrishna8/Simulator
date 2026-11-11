"use client";

import { useRef } from "react";
import { useModal } from "./useModal";
import { LESSONS } from "@/lessons";
import type { Lesson } from "@/lessons/types";
import { useStore } from "@/store";

/** A stable empty list: a selector that returns a new [] each call makes the store re-render forever. */
const NONE: number[] = [];

function Card({ lesson }: { lesson: Lesson }) {
  const done = useStore((s) => s.lessonDone[lesson.id] ?? NONE);
  const cur = useStore((s) => s.lesson);
  const start = useStore((s) => s.startLesson);
  const finished = done.length >= lesson.steps.length;
  const active = cur?.id === lesson.id;
  const nextStep = Math.min(lesson.steps.length - 1, Math.max(0, ...done.map((d) => d + 1)));
  const resume = active ? cur!.step : done.length && !finished ? nextStep : 0;
  return (
    <li className="lib-card">
      <div className="lib-meta">
        <span>{lesson.level}</span>
        <span>{lesson.minutes} min</span>
        <span>{lesson.steps.length} steps</span>
      </div>
      <h3>{lesson.title}</h3>
      <p>{lesson.summary}</p>
      <div className="lib-foot">
        <div className="lib-progress" role="img" aria-label={`${done.length} of ${lesson.steps.length} steps done`}>
          {lesson.steps.map((_, i) => <i key={i} className={done.includes(i) ? "is-done" : ""} />)}
        </div>
        <button type="button" className="btn is-primary" onClick={() => start(lesson.id, resume)}>
          {finished ? "Do it again" : done.length || active ? "Continue" : "Start"}
        </button>
      </div>
    </li>
  );
}

export default function LessonLibrary() {
  const open = useStore((s) => s.libraryOpen);
  const close = useStore((s) => s.openLibrary);
  const ref = useRef<HTMLDivElement>(null);

  useModal(ref, open, () => close(false));

  if (!open) return null;
  const groups: [string, string, Lesson[]][] = [
    ["Circuits", "No code. Build with a battery and a breadboard.", LESSONS.filter((l) => l.track === "circuits")],
    ["Arduino", "Wire a board and write the sketch.", LESSONS.filter((l) => l.track === "arduino")],
  ];
  return (
    <div className="modal-back" onPointerDown={(e) => e.target === e.currentTarget && close(false)}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="lib-title" ref={ref}>
        <header>
          <div>
            <h2 id="lib-title">Learn by building</h2>
            <p>Each lesson is a short series of steps. The bench checks your circuit as you go, so you always know if you are on track.</p>
          </div>
          <button type="button" className="btn" onClick={() => close(false)}>Close</button>
        </header>
        <div className="modal-body">
          {groups.map(([name, blurb, items]) => (
            <section key={name}>
              <h3>{name}</h3>
              <p className="muted">{blurb}</p>
              <ul className="lib-grid">{items.map((l) => <Card key={l.id} lesson={l} />)}</ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
