import { useState, type ReactNode } from 'react';
import { DemoTag, EmptyState, Field, Landing, NotFound, Notice, PageHead, Shell, downloadText, uid, useFlash, usePersistentState, useRoute } from './shared/ui';
import { toCSV } from './shared/csv';
import { addDays, formatDay, todayISO } from './shared/dates';
import { KINDS, KIND_LABEL, completion, hasChoices, moveQuestion, responseRows, summarize, validateQuestion, validateResponse, type Answer, type Kind, type Question, type Response, type Summary, type Survey } from './lib/survey';

const KEY = 'survey-studio:store';
const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/surveys', label: 'Surveys' },
];

interface Store {
  surveys: Survey[];
  responses: Response[];
}

const qn = (kind: Kind, title: string, p: Partial<Question> = {}): Question => ({ id: uid('q'), kind, title, help: '', required: false, choices: [], max: 0, ...p });

export function demoStore(): Store {
  const qs = [
    qn('rating', 'How useful was the workshop overall?', { required: true }),
    qn('single', 'Which session did you find most valuable?', { required: true, choices: ['Planning with constraints', 'Accessible design reviews', 'Writing clear briefs', 'Hands-on prototyping'] }),
    qn('multi', 'Which follow-up formats would you use?', { help: 'Choose up to two.', choices: ['Recorded videos', 'Written guides', 'Office hours', 'Community chat'], max: 2 }),
    qn('nps', 'How likely are you to recommend the workshop to a colleague?', { required: true }),
    qn('yesno', 'Would you attend a follow-up session?'),
    qn('long', 'What should we change next time?', { help: 'Optional — anything is helpful.' }),
  ];
  const survey: Survey = { id: 'demo-workshop', title: 'Workshop feedback', intro: 'Thanks for coming. This takes about two minutes and is anonymous.', questions: qs, open: true, demo: true };
  const texts = ['More time for the prototyping session, please.', 'Shorter breaks and a printed agenda.', '', 'The accessibility review was eye-opening — more examples would help.', '', 'Room was too warm in the afternoon.', '', 'Share the slides before the session.', '', '', 'A follow-up for managers would be useful.', ''];
  const responses: Response[] = texts.map((t, i) => ({
    id: `demo-r${i}`,
    surveyId: survey.id,
    at: `${addDays(todayISO(), -12 + i)}T${String(9 + (i % 8)).padStart(2, '0')}:15:00Z`,
    answers: {
      [qs[0].id]: [5, 4, 4, 5, 3, 4, 5, 2, 4, 5, 4, 4][i],
      [qs[1].id]: qs[1].choices[[3, 1, 3, 1, 0, 2, 3, 1, 3, 0, 1, 3][i]],
      [qs[2].id]: [['Written guides', 'Office hours'], ['Recorded videos'], [], ['Written guides'], ['Office hours', 'Community chat'], ['Recorded videos', 'Written guides'], ['Written guides'], [], ['Office hours'], ['Written guides', 'Recorded videos'], ['Community chat'], ['Written guides']][i],
      [qs[3].id]: [10, 8, 9, 10, 6, 7, 9, 3, 8, 10, 9, 7][i],
      [qs[4].id]: i % 4 === 3 ? 'No' : i === 6 ? null : 'Yes',
      [qs[5].id]: t || null,
    },
    demo: true,
  }));
  const draft: Survey = { id: 'demo-draft', title: 'Office move: what matters to you?', intro: 'Help us plan the new space.', questions: [qn('multi', 'What do you need most at your desk?', { choices: ['Second monitor', 'Standing desk', 'Quiet', 'Natural light'], max: 2 }), qn('short', 'Anything else?')], open: false, demo: true };
  return { surveys: [survey, draft], responses };
}

export default function App() {
  const [route, navigate] = useRoute();
  const [store, setStore] = usePersistentState<Store>(KEY, demoStore);
  const ctx = { store, setStore, navigate };
  const m = route.match(/^\/survey\/([^/]+)\/(build|take|results|thanks)(\?preview)?$/);
  let page: ReactNode;
  if (route === '/') page = <Home />;
  else if (route === '/surveys') page = <Surveys {...ctx} />;
  else if (m?.[2] === 'build') page = <Builder {...ctx} id={m[1]} />;
  else if (m?.[2] === 'take') page = <Take {...ctx} id={m[1]} />;
  else if (m?.[2] === 'thanks') page = <Thanks {...ctx} id={m[1]} preview={!!m[3]} />;
  else if (m?.[2] === 'results') page = <Results {...ctx} id={m[1]} />;
  else page = <NotFound />;
  return (
    <Shell name="Survey Studio" wordmark={['Survey', 'Studio']} nav={NAV} route={route} cta={{ to: '/surveys', label: 'New survey' }} footerNote="Responses are collected in this browser only — ideal for a shared kiosk, a workshop laptop or testing a survey before you send it.">
      {page}
    </Shell>
  );
}

type Ctx = { store: Store; setStore: (s: Store) => void; navigate: (to: string) => void };

/* ---------- Charts ---------- */
function SummaryView({ q, s, compact }: { q: Question; s: Summary; compact?: boolean }) {
  if (s.kind === 'choices') {
    const max = Math.max(1, ...s.options.map((o) => o.count));
    return (
      <ul className="hbars" aria-label={`${q.title}: ${s.options.map((o) => `${o.label} ${o.count}`).join(', ')}`}>
        {s.options.map((o, i) => (
          <li key={o.label} style={{ ['--i' as string]: i }} title={`${o.label}: ${o.count} (${o.pct}%)`}>
            <span className="hb-label">{o.label}</span>
            <span className="hb-track"><span style={{ width: `${(o.count / max) * 100}%` }} /></span>
            <span className="hb-num mono">{o.count}{!compact && <small> · {o.pct}%</small>}</span>
          </li>
        ))}
      </ul>
    );
  }
  if (s.kind === 'scale' || s.kind === 'nps') {
    const max = Math.max(1, ...s.dist.map((d) => d.count));
    const color = (v: number) => (s.kind === 'nps' ? (v >= 9 ? 'var(--ok)' : v <= 6 ? 'var(--err)' : 'var(--warn)') : 'var(--accent)');
    return (
      <div className="scale">
        <div className="scale-head">
          {s.kind === 'scale' ? <><b className="big">{s.average ?? '—'}</b><span className="small muted">average out of 5 · {s.answered} answers</span></> : <><b className="big">{s.score == null ? '—' : s.score > 0 ? `+${s.score}` : s.score}</b><span className="small muted">NPS · {s.promoters} promoters, {s.passives} passives, {s.detractors} detractors</span></>}
        </div>
        <div className="cols" role="img" aria-label={`Distribution: ${s.dist.map((d) => `${d.value}: ${d.count}`).join(', ')}`}>
          {s.dist.map((d) => (
            <div key={d.value} className="col-wrap" title={`${d.value}: ${d.count} response${d.count === 1 ? '' : 's'}`}>
              <span className="col-n small">{d.count || ''}</span>
              <span className="col" style={{ height: `${(d.count / max) * 100}%`, background: color(d.value) }} />
              <span className="col-l mono">{d.value}</span>
            </div>
          ))}
        </div>
        {s.kind === 'nps' && !compact && <p className="legend"><span><i style={{ background: 'var(--err)' }} />0–6 detractors</span><span><i style={{ background: 'var(--warn)' }} />7–8 passives</span><span><i style={{ background: 'var(--ok)' }} />9–10 promoters</span><span className="muted">· NPS = % promoters − % detractors</span></p>}
      </div>
    );
  }
  return s.answers.length === 0 ? <p className="muted small">No written answers yet.</p> : (
    <ul className="quotes">{s.answers.slice(0, compact ? 2 : 50).map((a, i) => <li key={i}><q>{a.text}</q><span className="small muted">{formatDay(a.at.slice(0, 10), { day: 'numeric', month: 'short' })}</span></li>)}</ul>
  );
}

function HeroPreview() {
  const s = demoStore();
  const survey = s.surveys[0];
  return (
    <div className="hero-ss">
      <div className="row-between"><strong className="hero-ss-title">{survey.title}</strong><span className="small muted">{s.responses.length} responses</span></div>
      <div className="hero-ss-grid">
        <div><p className="eyebrow">{survey.questions[3].title.slice(0, 40)}…</p><SummaryView q={survey.questions[3]} s={summarize(survey.questions[3], s.responses)} compact /></div>
        <div><p className="eyebrow">Most valuable session</p><SummaryView q={survey.questions[1]} s={summarize(survey.questions[1], s.responses)} compact /></div>
      </div>
    </div>
  );
}

function Home() {
  return (
    <Landing
      eyebrow="Survey builder"
      title={<>Ask better questions. <em>Read the answers.</em></>}
      lead="Build a short survey from seven question types, take it on this device, and see the results summarised the moment answers come in — averages, distributions, NPS and every written comment."
      primary={{ href: '#/surveys', label: 'Open your surveys' }}
      secondary={{ href: '#/survey/demo-workshop/results', label: 'See demo results' }}
      previewLabel="Workshop feedback — demo responses"
      preview={<HeroPreview />}
      steps={[
        { title: 'Build', body: 'Add questions — short and long text, single choice, checkboxes, 1–5 rating, 0–10 likelihood, yes/no — and mark the essentials as required.' },
        { title: 'Collect', body: 'Open the survey on a laptop at the door of an event or pass a tablet round. Answers are checked before they’re saved.' },
        { title: 'Understand', body: 'Each question gets the right summary, with labelled charts. Export every response as CSV.' },
      ]}
      stepsIntro="Survey Studio opens with a labelled demo survey and twelve fictional responses, plus a draft to edit."
      features={[
        { title: 'Seven question types', body: 'Including checkboxes with a selection limit and a 0–10 likelihood scale.' },
        { title: 'Friendly validation', body: 'Required answers and limits are checked with clear messages next to the question.' },
        { title: 'Honest summaries', body: 'Checkbox percentages are of respondents; NPS shows promoters, passives and detractors.' },
        { title: 'Spreadsheet-ready', body: 'One row per response, one column per question, in CSV.' },
      ]}
      note="Survey Studio collects responses on the device it’s open on. It isn’t an online form service — there’s no link to send to other people."
      closing={{ title: <>Five questions <em>are usually enough.</em></>, action: { href: '#/surveys', label: 'Build a survey' } }}
    />
  );
}

/* ---------- Surveys list ---------- */
function Surveys({ store, setStore, navigate }: Ctx) {
  const [title, setTitle] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useFlash();
  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return setErr('Give the survey a title.');
    const id = uid('survey');
    setStore({ ...store, surveys: [...store.surveys, { id, title: title.trim(), intro: '', questions: [qn('rating', 'How satisfied are you overall?', { required: true })], open: false }] });
    navigate(`/survey/${id}/build`);
  }
  return (
    <div className="stack">
      <PageHead eyebrow="Surveys" title={<>Your <em>surveys.</em></>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      <form className="card filters" onSubmit={create} noValidate>
        <Field label="New survey title" className="grow" error={err}>{(p) => <input {...p} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Team offsite feedback" />}</Field>
        <button className="btn btn-primary" type="submit">Create survey</button>
      </form>
      {store.surveys.length === 0 ? <EmptyState title="No surveys yet" actions={<button type="button" className="btn" onClick={() => setStore(demoStore())}>Load demo survey</button>}>Create one above.</EmptyState> : (
        <div className="grid-2">
          {store.surveys.map((s, i) => {
            const n = store.responses.filter((r) => r.surveyId === s.id).length;
            return (
              <article key={s.id} className="card stack survey-card" data-reveal style={{ ['--i' as string]: i }}>
                <div className="card-title-row"><h2 className="h3">{s.title}</h2><span className={`badge ${s.open ? 'badge-ok' : ''}`}>{s.open ? 'Open' : 'Draft'}</span></div>
                <p className="small muted">{s.questions.length} question{s.questions.length === 1 ? '' : 's'} · {n} response{n === 1 ? '' : 's'}{s.demo && <> · <DemoTag /></>}</p>
                <div className="row">
                  <a className="btn btn-sm" href={`#/survey/${s.id}/build`}>Edit</a>
                  <a className="btn btn-sm" href={`#/survey/${s.id}/take`}>{s.open ? 'Take survey' : 'Preview'}</a>
                  <a className="btn btn-sm btn-primary" href={`#/survey/${s.id}/results`}>Results</a>
                </div>
              </article>
            );
          })}
        </div>
      )}
      {store.surveys.some((s) => s.demo) && <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { const ids = new Set(store.surveys.filter((s) => s.demo).map((s) => s.id)); setStore({ surveys: store.surveys.filter((s) => !s.demo), responses: store.responses.filter((r) => !ids.has(r.surveyId)) }); setFlash({ kind: 'success', text: 'Demo surveys removed.' }); }}>Clear demo surveys</button></div>}
    </div>
  );
}

/* ---------- Builder ---------- */
function Builder({ store, setStore, navigate, id }: Ctx & { id: string }) {
  const s = store.surveys.find((x) => x.id === id);
  const [flash, setFlash] = useFlash();
  const [checked, setChecked] = useState(false);
  if (!s) return <EmptyState title="Survey not found" actions={<a className="btn btn-primary" href="#/surveys">Back</a>} />;
  const update = (patch: Partial<Survey>) => setStore({ ...store, surveys: store.surveys.map((x) => (x.id === s.id ? { ...x, ...patch } : x)) });
  const setQ = (qid: string, patch: Partial<Question>) => update({ questions: s.questions.map((q) => (q.id === qid ? { ...q, ...patch } : q)) });
  const errors = Object.fromEntries(s.questions.map((q) => [q.id, validateQuestion(q)]).filter(([, e]) => e));
  const hasResponses = store.responses.some((r) => r.surveyId === s.id);
  function publish() {
    setChecked(true);
    if (!s!.title.trim() || Object.keys(errors).length || !s!.questions.length) return setFlash({ kind: 'error', text: 'Fix the highlighted questions before opening the survey.' });
    update({ open: true });
    setFlash({ kind: 'success', text: 'Survey is open for responses.' });
  }
  return (
    <div className="stack">
      <PageHead eyebrow={<><a href="#/surveys">Surveys</a> / {s.open ? 'Open' : 'Draft'}</>} title={<>Build <em>{s.title || 'survey'}</em></>}
        actions={<><a className="btn" href={`#/survey/${s.id}/take`}>Preview</a>{s.open ? <button type="button" className="btn" onClick={() => update({ open: false })}>Close survey</button> : <button type="button" className="btn btn-primary" onClick={publish}>Open for responses</button>}<button type="button" className="btn btn-danger" onClick={() => { if (window.confirm(`Delete “${s.title}” and its responses?`)) { setStore({ surveys: store.surveys.filter((x) => x.id !== s.id), responses: store.responses.filter((r) => r.surveyId !== s.id) }); navigate('/surveys'); } }}>Delete</button></>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {hasResponses && <Notice kind="info">This survey already has responses. Changing options can make earlier answers harder to compare.</Notice>}
      <div className="card stack">
        <Field label="Survey title">{(p) => <input {...p} value={s.title} onChange={(e) => update({ title: e.target.value })} />}</Field>
        <Field label="Introduction" hint="Shown above the first question">{(p) => <textarea {...p} rows={2} value={s.intro} onChange={(e) => update({ intro: e.target.value })} />}</Field>
      </div>
      <ol className="q-list">
        {s.questions.map((q, i) => (
          <li key={q.id} className="card stack q-card">
            <div className="card-title-row">
              <span className="label-mono">Question {i + 1} · {KIND_LABEL[q.kind]}</span>
              <span className="row nowrap">
                <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => update({ questions: moveQuestion(s.questions, i, -1) })}>↑</button>
                <button type="button" className="icon-btn" aria-label={`Move question ${i + 1} down`} disabled={i === s.questions.length - 1} onClick={() => update({ questions: moveQuestion(s.questions, i, 1) })}>↓</button>
                <button type="button" className="icon-btn" aria-label={`Delete question ${i + 1}`} onClick={() => update({ questions: s.questions.filter((x) => x.id !== q.id) })}>✕</button>
              </span>
            </div>
            {checked && errors[q.id] && <p className="error-text" role="alert">{errors[q.id]}</p>}
            <div className="form-grid">
              <Field label={`Question ${i + 1} text`} className="span-2">{(p) => <input {...p} value={q.title} onChange={(e) => setQ(q.id, { title: e.target.value })} />}</Field>
              <Field label="Type">{(p) => <select {...p} value={q.kind} onChange={(e) => { const k = e.target.value as Kind; setQ(q.id, { kind: k, choices: hasChoices(k) && q.choices.length < 2 ? ['Option 1', 'Option 2'] : q.choices }); }}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>}</Field>
            </div>
            <Field label="Help text" hint="Optional">{(p) => <input {...p} value={q.help} onChange={(e) => setQ(q.id, { help: e.target.value })} />}</Field>
            {hasChoices(q.kind) && (
              <fieldset className="stack">
                <legend className="label">Options</legend>
                {q.choices.map((c, ci) => (
                  <div key={ci} className="row nowrap opt-row">
                    <label className="sr-only" htmlFor={`${q.id}-c${ci}`}>Option {ci + 1}</label>
                    <input id={`${q.id}-c${ci}`} value={c} onChange={(e) => setQ(q.id, { choices: q.choices.map((x, j) => (j === ci ? e.target.value : x)) })} />
                    <button type="button" className="icon-btn" aria-label={`Remove option ${ci + 1}`} onClick={() => setQ(q.id, { choices: q.choices.filter((_, j) => j !== ci) })}>✕</button>
                  </div>
                ))}
                <div className="row">
                  <button type="button" className="btn btn-sm" onClick={() => setQ(q.id, { choices: [...q.choices, `Option ${q.choices.length + 1}`] })}>+ Add option</button>
                  {q.kind === 'multi' && <Field label="Max selections" hint="0 = no limit">{(p) => <input {...p} inputMode="numeric" style={{ maxWidth: 90 }} value={q.max} onChange={(e) => setQ(q.id, { max: Number(e.target.value) || 0 })} />}</Field>}
                </div>
              </fieldset>
            )}
            <label className="check"><input type="checkbox" checked={q.required} onChange={(e) => setQ(q.id, { required: e.target.checked })} /> Required</label>
          </li>
        ))}
      </ol>
      <div className="row add-q">
        {KINDS.map((k) => <button key={k} type="button" className="btn btn-sm" onClick={() => update({ questions: [...s.questions, qn(k, '', { choices: hasChoices(k) ? ['Option 1', 'Option 2'] : [] })] })}>+ {KIND_LABEL[k]}</button>)}
      </div>
    </div>
  );
}

/* ---------- Take ---------- */
function QuestionInput({ q, value, onChange, error, n }: { q: Question; value: Answer; onChange: (a: Answer) => void; error?: string; n: number }) {
  const hid = `${q.id}-h`, eid = `${q.id}-e`;
  const desc = [q.help && hid, error && eid].filter(Boolean).join(' ') || undefined;
  const legend = <legend className="q-title">{n}. {q.title || 'Untitled question'}{q.required && <span className="req" aria-label="required"> *</span>}</legend>;
  const scale = (vals: number[], low: string, high: string) => (
    <div className="scale-pick" role="radiogroup" aria-label={q.title} aria-describedby={desc}>
      {vals.map((v) => <label key={v} className={`pill ${value === v ? 'on' : ''}`}><input type="radio" name={q.id} className="sr-only" checked={value === v} onChange={() => onChange(v)} />{v}</label>)}
      <span className="scale-ends small muted"><span>{low}</span><span>{high}</span></span>
    </div>
  );
  return (
    <fieldset className={`card stack take-q ${error ? 'has-error' : ''}`} aria-invalid={!!error}>
      {legend}
      {q.help && <p className="small muted" id={hid}>{q.help}</p>}
      {q.kind === 'short' && <input aria-label={q.title} aria-describedby={desc} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} maxLength={240} />}
      {q.kind === 'long' && <textarea aria-label={q.title} aria-describedby={desc} rows={4} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} />}
      {(q.kind === 'single' || q.kind === 'yesno') && (
        <div className="choices" role="radiogroup" aria-label={q.title} aria-describedby={desc}>
          {(q.kind === 'yesno' ? ['Yes', 'No'] : q.choices).map((c) => <label key={c} className="check"><input type="radio" name={q.id} checked={value === c} onChange={() => onChange(c)} /> {c}</label>)}
        </div>
      )}
      {q.kind === 'multi' && (
        <div className="choices" aria-describedby={desc}>
          {q.choices.map((c) => { const arr = (value as string[]) ?? []; return <label key={c} className="check"><input type="checkbox" checked={arr.includes(c)} onChange={(e) => onChange(e.target.checked ? [...arr, c] : arr.filter((x) => x !== c))} /> {c}</label>; })}
        </div>
      )}
      {q.kind === 'rating' && scale([1, 2, 3, 4, 5], 'Not at all', 'Extremely')}
      {q.kind === 'nps' && scale([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'Not likely', 'Very likely')}
      {error && <p className="error-text" id={eid}>{error}</p>}
    </fieldset>
  );
}

function Take({ store, setStore, navigate, id }: Ctx & { id: string }) {
  const s = store.surveys.find((x) => x.id === id);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!s) return <EmptyState title="Survey not found" actions={<a className="btn btn-primary" href="#/surveys">Back</a>} />;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateResponse(s!, answers);
    setErrors(errs);
    if (Object.keys(errs).length) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>('.take-q.has-error input, .take-q.has-error textarea')?.focus());
      return;
    }
    if (!s!.open) return navigate(`/survey/${s!.id}/thanks?preview`);
    const clean = Object.fromEntries(Object.entries(answers).map(([k, v]) => [k, typeof v === 'string' ? v.trim() || null : v]));
    setStore({ ...store, responses: [...store.responses, { id: uid('resp'), surveyId: s!.id, at: new Date().toISOString(), answers: clean }] });
    navigate(`/survey/${s!.id}/thanks`);
  }
  const done = s.questions.filter((q) => { const a = answers[q.id]; return a != null && a !== '' && !(Array.isArray(a) && !a.length); }).length;
  return (
    <form className="take" onSubmit={submit} noValidate>
      {!s.open && <Notice kind="info">Preview — this survey is a draft, so answers won’t be saved.</Notice>}
      <header className="take-head">
        <p className="eyebrow">Survey</p>
        <h1>{s.title}</h1>
        {s.intro && <p className="lead-sm">{s.intro}</p>}
        <div className="progress" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={s.questions.length} aria-valuenow={done}><span style={{ width: `${(done / Math.max(1, s.questions.length)) * 100}%` }} /></div>
        <p className="small muted">{done} of {s.questions.length} answered · <span aria-hidden="true">*</span> required</p>
      </header>
      {Object.keys(errors).length > 0 && <Notice kind="error">{Object.keys(errors).length === 1 ? 'One question needs' : `${Object.keys(errors).length} questions need`} attention.</Notice>}
      <div className="stack">
        {s.questions.map((q, i) => <QuestionInput key={q.id} q={q} n={i + 1} value={answers[q.id] ?? null} error={errors[q.id]} onChange={(a) => { setAnswers({ ...answers, [q.id]: a }); if (errors[q.id]) setErrors(({ [q.id]: _gone, ...rest }) => rest); }} />)}
      </div>
      <div className="row"><button className="btn btn-primary btn-lg" type="submit">{s.open ? 'Submit' : 'Check answers'}</button></div>
    </form>
  );
}

function Thanks({ store, id, preview }: Ctx & { id: string; preview: boolean }) {
  const s = store.surveys.find((x) => x.id === id);
  return (
    <EmptyState title={preview ? 'Answers look good' : 'Thank you — response saved'} actions={<>{s && <a className="btn btn-primary" href={`#/survey/${s.id}/take`}>{preview ? 'Back to preview' : 'Take it again (next person)'}</a>}{s && <a className="btn" href={`#/survey/${s.id}/results`}>See results</a>}</>}>
      {preview ? 'This was a preview, so nothing was saved.' : `${s?.title ?? 'The survey'} now has ${store.responses.filter((r) => r.surveyId === s?.id).length} responses.`}
    </EmptyState>
  );
}

/* ---------- Results ---------- */
function Results({ store, setStore, id }: Ctx & { id: string }) {
  const s = store.surveys.find((x) => x.id === id);
  const [flash, setFlash] = useFlash();
  if (!s) return <EmptyState title="Survey not found" actions={<a className="btn btn-primary" href="#/surveys">Back</a>} />;
  const mine = store.responses.filter((r) => r.surveyId === s.id);
  const comp = completion(s, store.responses);
  const exportCSV = () => { const { headers, rows } = responseRows(s, store.responses); downloadText(`${s.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-responses.csv`, toCSV(headers, rows), 'text/csv'); };
  return (
    <div className="stack">
      <PageHead eyebrow={<><a href="#/surveys">Surveys</a> / Results</>} title={<>{s.title}</>} description={`${mine.length} response${mine.length === 1 ? '' : 's'}${mine.length ? ` · latest ${formatDay(mine.map((r) => r.at).sort().at(-1)!.slice(0, 10))}` : ''}`}
        actions={<><button type="button" className="btn" disabled={!mine.length} onClick={exportCSV}>Export CSV</button><a className="btn btn-primary" href={`#/survey/${s.id}/take`}>Add a response</a></>} />
      {flash && <Notice kind={flash.kind} onDismiss={() => setFlash(null)}>{flash.text}</Notice>}
      {mine.length === 0 ? <EmptyState title="No responses yet" actions={<a className="btn btn-primary" href={`#/survey/${s.id}/take`}>{s.open ? 'Take the survey' : 'Preview the survey'}</a>}>{s.open ? 'Responses appear here as soon as someone submits.' : 'Open the survey from the builder to start collecting.'}</EmptyState> : (
        <>
          {s.questions.map((q, i) => (
            <section key={q.id} className="card stack" aria-labelledby={`r-${q.id}`} data-reveal>
              <div className="card-title-row"><h2 id={`r-${q.id}`} className="h3">{i + 1}. {q.title}</h2><span className="small muted">{comp[i].answered} of {comp[i].total} answered</span></div>
              <SummaryView q={q} s={summarize(q, store.responses.filter((r) => r.surveyId === s.id))} />
            </section>
          ))}
          <div><button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (window.confirm(`Delete all ${mine.length} responses to “${s.title}”?`)) { setStore({ ...store, responses: store.responses.filter((r) => r.surveyId !== s.id) }); setFlash({ kind: 'success', text: 'Responses deleted.' }); } }}>Delete all responses</button></div>
        </>
      )}
    </div>
  );
}
