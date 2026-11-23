import { describe, expect, it } from 'vitest';
import { completion, moveQuestion, responseRows, summarize, validateAnswer, validateQuestion, validateResponse, type Question, type Response, type Survey } from './survey';

const q = (p: Partial<Question>): Question => ({ id: 'q', kind: 'short', title: 'Q', help: '', required: false, choices: [], max: 0, ...p });
const r = (answers: Response['answers'], at = '2026-11-20T10:00:00Z'): Response => ({ id: Math.random().toString(), surveyId: 's', at, answers });

describe('question validation', () => {
  it('needs a title and two distinct options for choice questions', () => {
    expect(validateQuestion(q({ title: ' ' }))).toMatch(/Write/);
    expect(validateQuestion(q({ kind: 'single', choices: ['A', ''] }))).toMatch(/two options/);
    expect(validateQuestion(q({ kind: 'single', choices: ['Yes', 'yes'] }))).toMatch(/different/);
    expect(validateQuestion(q({ kind: 'multi', choices: ['A', 'B'], max: 3 }))).toMatch(/between 0 and 2/);
    expect(validateQuestion(q({ kind: 'multi', choices: ['A', 'B'], max: 2 }))).toBeNull();
  });
});

describe('answer validation', () => {
  it('enforces required and type-specific rules', () => {
    expect(validateAnswer(q({ required: true }), '')).toMatch(/required/);
    expect(validateAnswer(q({}), null)).toBeNull();
    expect(validateAnswer(q({ kind: 'single', choices: ['A', 'B'] }), 'C')).toMatch(/Choose one/);
    expect(validateAnswer(q({ kind: 'multi', choices: ['A', 'B', 'C'], max: 2 }), ['A', 'B', 'C'])).toBe('Choose up to 2.');
    expect(validateAnswer(q({ kind: 'rating' }), 6)).toMatch(/1 to 5/);
    expect(validateAnswer(q({ kind: 'nps' }), 0)).toBeNull();
    expect(validateAnswer(q({ kind: 'short' }), 'x'.repeat(201))).toMatch(/200/);
  });
  it('validates a whole response', () => {
    const s: Survey = { id: 's', title: 'S', intro: '', open: true, questions: [q({ id: 'a', required: true }), q({ id: 'b', kind: 'rating' })] };
    expect(validateResponse(s, { b: 9 })).toEqual({ a: 'This question is required.', b: 'Choose 1 to 5.' });
  });
});

describe('summaries', () => {
  it('counts single and multi choices (multi as % of respondents)', () => {
    const multi = q({ id: 'm', kind: 'multi', choices: ['Docs', 'Video', 'Chat'] });
    const s = summarize(multi, [r({ m: ['Docs', 'Chat'] }), r({ m: ['Docs'] }), r({ m: [] })]);
    expect(s).toEqual({ kind: 'choices', answered: 2, options: [{ label: 'Docs', count: 2, pct: 100 }, { label: 'Video', count: 0, pct: 0 }, { label: 'Chat', count: 1, pct: 50 }] });
  });
  it('averages ratings with a distribution', () => {
    const s = summarize(q({ id: 'r', kind: 'rating' }), [r({ r: 5 }), r({ r: 4 }), r({ r: 4 }), r({})]);
    expect(s).toMatchObject({ kind: 'scale', answered: 3, average: 4.33 });
    if (s.kind === 'scale') expect(s.dist.map((d) => d.count)).toEqual([0, 0, 0, 2, 1]);
  });
  it('computes an NPS score', () => {
    const s = summarize(q({ id: 'n', kind: 'nps' }), [10, 9, 8, 7, 6, 3, 10, 10].map((v) => r({ n: v })));
    expect(s).toMatchObject({ kind: 'nps', answered: 8, promoters: 4, passives: 2, detractors: 2, score: 25 });
  });
  it('lists text answers newest first', () => {
    const s = summarize(q({ id: 't' }), [r({ t: 'older' }, '2026-11-01T00:00:00Z'), r({ t: 'newer' }, '2026-11-02T00:00:00Z')]);
    expect(s.kind === 'text' && s.answers.map((a) => a.text)).toEqual(['newer', 'older']);
  });
});

describe('export and ordering', () => {
  const s: Survey = { id: 's', title: 'S', intro: '', open: true, questions: [q({ id: 'a', title: 'Name' }), q({ id: 'b', kind: 'multi', title: 'Topics', choices: ['X', 'Y'] })] };
  it('writes a row per response in submission order', () => {
    const out = responseRows(s, [r({ a: 'Z', b: ['X', 'Y'] }, '2026-11-02T00:00:00Z'), r({ a: 'A' }, '2026-11-01T00:00:00Z'), { ...r({}), surveyId: 'other' }]);
    expect(out.headers).toEqual(['Submitted', 'Name', 'Topics']);
    expect(out.rows).toEqual([['2026-11-01T00:00:00Z', 'A', ''], ['2026-11-02T00:00:00Z', 'Z', 'X; Y']]);
  });
  it('moves questions within bounds and reports completion', () => {
    expect(moveQuestion(s.questions, 0, 1).map((x) => x.id)).toEqual(['b', 'a']);
    expect(moveQuestion(s.questions, 0, -1)).toBe(s.questions);
    expect(completion(s, [r({ a: 'x' }), r({})]).map((c) => c.answered)).toEqual([1, 0]);
  });
});
