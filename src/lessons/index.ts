import { arduinoLessons } from "./content/arduino";
import { circuitLessons } from "./content/circuits";
import type { Lesson, LessonState } from "./types";

export const LESSONS: Lesson[] = [...circuitLessons, ...arduinoLessons];

export const lessonById = (id: string): Lesson | undefined => LESSONS.find((l) => l.id === id);

/** The bench before the lesson, then after each step done correctly. */
export function solutionChain(lesson: Lesson): LessonState[] {
  const chain: LessonState[] = [lesson.start];
  for (const step of lesson.steps) chain.push(step.solution(chain[chain.length - 1]));
  return chain;
}

export type { Lesson, Step, Goal, Ctx, LessonState } from "./types";
