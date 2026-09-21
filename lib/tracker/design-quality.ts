import { ALL_QUESTIONS, MinimizedInput } from '../questionnaire';
import type { TrackerDefinition } from './schema';

/** Product constraints for newly generated designs. Existing saved diaries keep their schema. */
export const DAILY_BUDGETS: Record<string, { fields: number; minutes: number | null }> = {
  'do 1 minuty': { fields: 5, minutes: 1 },
  '2–3 minuty': { fields: 8, minutes: 3 },
  'asi 5 minut': { fields: 12, minutes: 5 },
  'klidně víc': { fields: 16, minutes: null },
};

const COMPARABLE_TYPES = new Set(['scale', 'number', 'boolean', 'single_select', 'duration']);

/** Checks only observable structure; does not pretend to judge medical relevance or text meaning. */
export function trackerDesignProblems(definition: TrackerDefinition, input: MinimizedInput): string[] {
  const problems: string[] = [];
  const dailySections = definition.sections.filter((section) => section.kind === 'daily');
  const dailyFields = dailySections.flatMap((section) => section.fields);
  const timelineFields = definition.sections.filter((section) => section.kind === 'timeline').flatMap((section) => section.fields);
  const allFields = definition.sections.flatMap((section) => section.fields);
  const timeQuestion = ALL_QUESTIONS.find((question) => question.id === 'cas_denne')?.label;
  const timeAnswer = input.answers.find((answer) => answer.question === timeQuestion)?.answer;
  // Missing time is possible in old / minimized inputs; preserve the most generous hard limit.
  const budget = timeAnswer && Object.prototype.hasOwnProperty.call(DAILY_BUDGETS, timeAnswer)
    ? DAILY_BUDGETS[timeAnswer]
    : DAILY_BUDGETS['klidně víc'];

  if (!dailyFields.length) problems.push('Návrh neobsahuje denní sledování.');
  if (dailySections.length > 2) problems.push('Návrh má více než dvě denní sekce.');
  if (dailyFields.length > budget.fields) problems.push('Počet denních polí překračuje zvolený časový rozsah.');
  if (timelineFields.length > 4) problems.push('Návrh má více než čtyři kategorie událostí.');

  const requiredDaily = dailyFields.filter((field) => field.required);
  if (requiredDaily.length < 1 || requiredDaily.length > 2) {
    problems.push('Návrh musí obsahovat jedno až dvě hlavní povinná denní pole.');
  }
  if (!requiredDaily.some((field) => !field.visibility && COMPARABLE_TYPES.has(field.type))) {
    problems.push('Návrhu chybí stále dostupné hlavní měření pro porovnání dní.');
  }
  if (timelineFields.some((field) => field.required)) {
    problems.push('Události v průběhu dne musí zůstat nepovinné.');
  }
  if (allFields.some((field) => !field.description?.trim())) {
    problems.push('U některých polí chybí vysvětlení zápisu.');
  }
  if (allFields.some((field) => ['number', 'duration', 'sleep'].includes(field.type) && !field.unit?.trim())) {
    problems.push('U číselného údaje chybí jednotka.');
  }
  if (!definition.estimatedDailyMinutes) {
    problems.push('U návrhu chybí odhad denní doby zápisu.');
  } else if (budget.minutes !== null && definition.estimatedDailyMinutes > budget.minutes) {
    problems.push('Odhad doby zápisu překračuje zvolený časový rozsah.');
  }
  return problems;
}
