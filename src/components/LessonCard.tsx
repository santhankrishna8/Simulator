"use client";

import { useEffect, useState } from "react";
import { lessonById } from "@/lessons";
import type { Ctx } from "@/lessons/types";
import { buildNets } from "@/lessons/nets";
import { useStore } from "@/store";
import Rich from "./Rich";

function Tick({ on }: { on: boolean }) {
  return (
    <span className={`tick${on ? " is-on" : ""}`} aria-hidden>
      {on && (
        <svg viewBox="0 0 12 12" width="10" height="10">
          <path d="M2.4 6.4l2.4 2.4 4.8-5.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export default function LessonCard() {
  const cur = useStore((s) => s.lesson);
  const result = useStore((s) => s.stepResult);
  const complete = useStore((s) => s.stepComplete);
  const hintOpen = useStore((s) => s.hintOpen);
  const done = useStore((s) => s.lessonDone);
  const set = useStore((s) => s.set);
  const { exitLesson, lessonGo, lessonShowMe, startLesson, openLibrary } = useStore.getState();
  // "Show me" replaces the bench, so it asks twice. The question belongs to one step and expires.
  const [confirmKey, setConfirmKey] = useState<string | null>(null);
  const stepKey = cur ? `${cur.id}:${cur.step}` : "";
  const confirm = confirmKey === stepKey;
  useEffect(() => {
    if (!confirmKey) return;
    const id = setTimeout(() => setConfirmKey(null), 4000);
    return () => clearTimeout(id);
  }, [confirmKey]);

  const lesson = cur && lessonById(cur.id);
  if (!cur || !lesson) return null;

  const finished = cur.step >= lesson.steps.length;
  const step = finished ? null : lesson.steps[cur.step];
  const finishedSteps = done[lesson.id] ?? [];
  const next = lesson.next ? lessonById(lesson.next) : undefined;

  /** What the step's "after" text gets to look at. */
  const after = (() => {
    if (!step || !complete) return "";
    if (typeof step.after === "string") return step.after;
    const st = useStore.getState();
    const ctx: Ctx = { doc: st.doc, nets: buildNets(st.doc), snap: st.snapshot, code: st.code, build: st.build, builtCode: st.builtCode, serial: st.serial, running: st.running, trace: st.trace };
    return step.after(ctx);
  })();

  return (
    <section className="lesson" aria-label={`Lesson: ${lesson.title}`}>
      <header className="lesson-head">
        <div>
          <p className="lesson-kicker">{lesson.track === "arduino" ? "Arduino" : "Circuits"} · {lesson.level}</p>
          <h2>{lesson.title}</h2>
        </div>
        <button type="button" className="btn is-ghost" onClick={exitLesson} aria-label="Leave the lesson">Leave</button>
      </header>

      <ol className="lesson-steps" aria-label="Steps">
        {lesson.steps.map((s, i) => (
          <li key={i} className={finishedSteps.includes(i) ? "is-done" : i === cur.step ? "is-now" : ""}>
            <button type="button" onClick={() => lessonGo(i)} aria-label={`Step ${i + 1}: ${s.title}`} aria-current={i === cur.step ? "step" : undefined} />
          </li>
        ))}
      </ol>

      {finished ? (
        <div className="lesson-body">
          <h3>Lesson complete</h3>
          <p className="lesson-lead">You finished “{lesson.title}”. What to remember:</p>
          <ul className="takeaways">{lesson.takeaways.map((t) => <li key={t}>{t}</li>)}</ul>
          <div className="lesson-actions">
            {next && <button type="button" className="btn is-primary" onClick={() => startLesson(next.id)}>Next: {next.title}</button>}
            <button type="button" className="btn" onClick={() => openLibrary(true)}>All lessons</button>
            <button type="button" className="btn is-ghost" onClick={() => lessonGo(0)}>Review the steps</button>
          </div>
        </div>
      ) : (
        <div className="lesson-body">
          <p className="lesson-count">Step {cur.step + 1} of {lesson.steps.length}</p>
          <h3>{step!.title}</h3>
          <Rich text={step!.body} />

          <ul className="goals" aria-label="Goals">
            {step!.goals.map((g, i) => {
              const ok = !!result?.passed[i];
              return (
                <li key={i} className={ok ? "is-on" : ""}>
                  <Tick on={ok} />
                  <span>{g.label}<span className="sr-only">{ok ? " (done)" : " (to do)"}</span></span>
                </li>
              );
            })}
          </ul>

          <div role="status" aria-live="polite">
            {complete && (
              <div className="lesson-win">
                <b>Step complete</b>
                <Rich text={after} />
              </div>
            )}
          </div>

          {hintOpen && !complete && (
            <div className="lesson-hint">
              <b>Hint</b>
              <Rich text={step!.hint} />
            </div>
          )}

          <div className="lesson-actions">
            {complete ? (
              <button type="button" className="btn is-primary" onClick={() => lessonGo(cur.step + 1)}>
                {cur.step + 1 >= lesson.steps.length ? "Finish lesson" : "Next step"}
              </button>
            ) : (
              <>
                <button type="button" className="btn" aria-expanded={hintOpen} onClick={() => set({ hintOpen: !hintOpen })}>
                  {hintOpen ? "Hide hint" : "Hint"}
                </button>
                <button
                  type="button"
                  className={`btn${confirm ? " is-warn" : " is-ghost"}`}
                  onClick={() => {
                    if (confirm) {
                      setConfirmKey(null);
                      lessonShowMe();
                    } else setConfirmKey(stepKey);
                  }}
                >
                  {confirm ? "Replace my bench?" : "Show me"}
                </button>
              </>
            )}
            {cur.step > 0 && <button type="button" className="btn is-ghost" onClick={() => lessonGo(cur.step - 1)}>Back</button>}
            {!complete && <button type="button" className="btn is-ghost" onClick={() => lessonGo(cur.step + 1)}>Skip</button>}
          </div>
        </div>
      )}
    </section>
  );
}
