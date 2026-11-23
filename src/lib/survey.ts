export const KINDS = ['short', 'long', 'single', 'multi', 'rating', 'nps', 'yesno'] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { short: 'Short answer', long: 'Paragraph', single: 'Single choice', multi: 'Checkboxes', rating: 'Rating 1–5', nps: 'Likelihood 0–10', yesno: 'Yes / No' };

export interface Question {
  id: string;
  kind: Kind;
  title: string;
  help: string;
  required: boolean;
  choices: string[];
  /** For multi: maximum selections (0 = no limit). */
  max: number;
}

export interface Survey {
  id: string;
  title: string;
  intro: string;
  questions: Question[];
  open: boolean;
  demo?: boolean;
}

export type Answer = string | string[] | number | null;

export interface Response {
  id: string;
  surveyId: string;
  at: string; // ISO timestamp
  answers: Record<string, Answer>;
  demo?: boolean;
}

export const hasChoices = (k: Kind) => k === 'single' || k === 'multi';

export function validateQuestion(q: Question): string | null {
  if (!q.title.trim()) return 'Write the question.';
  if (hasChoices(q.kind)) {
    const c = q.choices.map((x) => x.trim()).filter(Boolean);
    if (c.length < 2) return 'Add at least two options.';
    if (new Set(c.map((x) => x.toLowerCase())).size !== c.length) return 'Options must be different from each other.';
    if (q.kind === 'multi' && (q.max < 0 || q.max > c.length)) return `Maximum selections must be between 0 and ${c.length}.`;
  }
  return null;
}

const isEmpty = (a: Answer) => a == null || a === '' || (Array.isArray(a) && a.length === 0);

export function validateAnswer(q: Question, a: Answer): string | null {
  if (isEmpty(a)) return q.required ? 'This question is required.' : null;
  switch (q.kind) {
    case 'short':
      return typeof a === 'string' && a.length > 200 ? 'Keep it under 200 characters.' : null;
    case 'long':
      return typeof a === 'string' && a.length > 4000 ? 'Keep it under 4,000 characters.' : null;
    case 'single':
      return typeof a === 'string' && q.choices.includes(a) ? null : 'Choose one of the options.';
    case 'multi':
      if (!Array.isArray(a) || !a.every((x) => q.choices.includes(x))) return 'Choose from the options.';
      return q.max && a.length > q.max ? `Choose up to ${q.max}.` : null;
    case 'rating':
      return typeof a === 'number' && Number.isInteger(a) && a >= 1 && a <= 5 ? null : 'Choose 1 to 5.';
    case 'nps':
      return typeof a === 'number' && Number.isInteger(a) && a >= 0 && a <= 10 ? null : 'Choose 0 to 10.';
    case 'yesno':
      return a === 'Yes' || a === 'No' ? null : 'Choose yes or no.';
  }
}

export function validateResponse(s: Survey, answers: Record<string, Answer>): Record<string, string> {
  const e: Record<string, string> = {};
  for (const q of s.questions) {
    const err = validateAnswer(q, answers[q.id] ?? null);
    if (err) e[q.id] = err;
  }
  return e;
}

export type Summary =
  | { kind: 'choices'; answered: number; options: { label: string; count: number; pct: number }[] }
  | { kind: 'scale'; answered: number; average: number | null; dist: { value: number; count: number }[] }
  | { kind: 'nps'; answered: number; score: number | null; promoters: number; passives: number; detractors: number; dist: { value: number; count: number }[] }
  | { kind: 'text'; answered: number; answers: { text: string; at: string }[] };

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export function summarize(q: Question, responses: Response[]): Summary {
  const given = responses.filter((r) => !isEmpty(r.answers[q.id] ?? null));
  const n = given.length;
  if (q.kind === 'single' || q.kind === 'multi' || q.kind === 'yesno') {
    const labels = q.kind === 'yesno' ? ['Yes', 'No'] : q.choices;
    // For checkboxes, percentages are of respondents (they can add up to more than 100%).
    return { kind: 'choices', answered: n, options: labels.map((label) => { const count = given.filter((r) => { const a = r.answers[q.id]; return Array.isArray(a) ? a.includes(label) : a === label; }).length; return { label, count, pct: pct(count, n) }; }) };
  }
  if (q.kind === 'rating') {
    const vals = given.map((r) => r.answers[q.id] as number);
    return { kind: 'scale', answered: n, average: n ? Math.round((vals.reduce((s, v) => s + v, 0) / n) * 100) / 100 : null, dist: [1, 2, 3, 4, 5].map((value) => ({ value, count: vals.filter((v) => v === value).length })) };
  }
  if (q.kind === 'nps') {
    const vals = given.map((r) => r.answers[q.id] as number);
    const promoters = vals.filter((v) => v >= 9).length, detractors = vals.filter((v) => v <= 6).length;
    return { kind: 'nps', answered: n, score: n ? Math.round(((promoters - detractors) / n) * 100) : null, promoters, passives: n - promoters - detractors, detractors, dist: Array.from({ length: 11 }, (_, value) => ({ value, count: vals.filter((v) => v === value).length })) };
  }
  return { kind: 'text', answered: n, answers: given.map((r) => ({ text: String(r.answers[q.id]), at: r.at })).sort((a, b) => b.at.localeCompare(a.at)) };
}

export function formatAnswer(a: Answer | undefined): string {
  if (a == null) return '';
  return Array.isArray(a) ? a.join('; ') : String(a);
}

export function responseRows(s: Survey, responses: Response[]) {
  const headers = ['Submitted', ...s.questions.map((q) => q.title)];
  const rows = responses.filter((r) => r.surveyId === s.id).sort((a, b) => a.at.localeCompare(b.at)).map((r) => [r.at, ...s.questions.map((q) => formatAnswer(r.answers[q.id]))]);
  return { headers, rows };
}

export function moveQuestion(qs: Question[], i: number, dir: -1 | 1): Question[] {
  const j = i + dir;
  if (j < 0 || j >= qs.length) return qs;
  const out = [...qs];
  [out[i], out[j]] = [out[j], out[i]];
  return out;
}

/** Completion rate per question: how many respondents answered it (useful for spotting skipped optional questions). */
export function completion(s: Survey, responses: Response[]) {
  const mine = responses.filter((r) => r.surveyId === s.id);
  return s.questions.map((q) => ({ question: q, answered: mine.filter((r) => !isEmpty(r.answers[q.id] ?? null)).length, total: mine.length }));
}
