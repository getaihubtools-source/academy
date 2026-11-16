// تست‌های M5 — آزمون، تمرین، پروژه، ذخیره نتیجه، خلاصه دوره/داشبورد
import { createStore } from '../js/core/store.js';
import { DEFAULT_SETTINGS } from '../js/core/prefs.js';
import { openDb } from '../js/db/idb.js';
import { migrations } from '../js/db/schema.js';
import { createRepos } from '../js/db/repos.js';
import { createCourseService } from '../js/db/courses.js';
import { createNotesService } from '../js/db/notes.js';
import { createResultsService, ResultError, PROJECT_TEXT_MAX } from '../js/db/results.js';
import { scoreQuiz, collectAssessments, summarize } from '../js/features/assessments.js';
import { parsePack } from '../js/packs/loader.js';
import { quiz, exercise, project } from '../js/render/blocks/assess.js';
import { createValidator } from '../js/render/check.js';
import { extractBlock, INDEX_VERSION } from '../js/features/search.js';
import { render as renderLesson } from '../js/views/lesson.js';
import { render as renderCourse } from '../js/views/course.js';
import { render as renderDashboard } from '../js/views/dashboard.js';

const eq = (a, b, msg = '') => { if (!Object.is(a, b)) throw new Error(`${msg} expected ${JSON.stringify(b)} but got ${JSON.stringify(a)}`); };
const ok = (v, msg = 'expected truthy') => { if (!v) throw new Error(msg); };
const rejectsWith = async (fn, Type) => {
  try { await fn(); } catch (err) { if (!Type || err instanceof Type) return err; throw err; }
  throw new Error('expected rejection');
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 3000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return; } catch { /* هنوز آماده نیست */ } await sleep(10); }
  throw new Error('waitFor timeout');
}

let SAMPLE_TEXT = '';
const SID = 'sample-motion-lab';
const samplePack = () => parsePack(SAMPLE_TEXT).pack;

let counter = 0;
async function env() {
  const db = await openDb({ name: `m5-db-${Date.now()}-${counter++}`, migrations });
  const e = {
    db, repos: createRepos(db, 'test'), svc: createCourseService(db), notes: createNotesService(db), results: createResultsService(db),
    store: createStore({ dbStatus: 'ready', settings: { ...DEFAULT_SETTINGS } }), announced: [],
    router: { href: (p) => '#' + p, navigate() {} },
  };
  e.announce = (m) => e.announced.push(m);
  return e;
}
const view = (e, extra = {}) => ({ store: e.store, repos: e.repos, svc: e.svc, notes: e.notes, results: e.results, router: e.router, announce: e.announce, ...extra });
const lessonView = (e, lid, e2 = {}) => renderLesson(view(e, { params: { id: SID, lid }, query: new URLSearchParams(), ...e2 }));

const issues = (def, block) => { const v = createValidator(); def.validate(block, 'b', v); return v.issues.filter((i) => i.level === 'error'); };
const QUIZ = {
  type: 'quiz', id: 'q1', passScore: 60,
  questions: [
    { text: 'الف', options: ['۱', '۲', '۳'], correct: [1] },
    { text: 'ب', multiple: true, options: ['۱', '۲', '۳'], correct: [0, 2] },
    { text: 'ج', options: ['۱', '۲'], correct: [0] },
  ],
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ───── نمره‌دهی ───── */
test('scoreQuiz: همه‌یا‌هیچ، چندانتخابی دقیق، گرد کردن و نمره قبولی', () => {
  let r = scoreQuiz(QUIZ, [[1], [0, 2], [0]]);
  eq(r.score, 100); eq(r.passed, true); eq(r.complete, true);
  r = scoreQuiz(QUIZ, [[1], [0], [0]]); // چندانتخابی ناقص = غلط
  eq(r.correctCount, 2); eq(r.score, 67); eq(r.passed, true);
  r = scoreQuiz(QUIZ, [[0], [0], [1]]);
  eq(r.score, 0); eq(r.passed, false);
  r = scoreQuiz(QUIZ, [[1, 1], [2, 0, 0], [0]]); // تکرار نادیده گرفته می‌شود
  eq(r.score, 100);
});
test('scoreQuiz: مرز قبولی — نمره برابر حد قبولی قبول است', () => {
  const two = [[1], [0], [0]]; // ۲ از ۳ = ۶۷
  eq(scoreQuiz({ ...QUIZ, passScore: 67 }, two).passed, true);
  eq(scoreQuiz({ ...QUIZ, passScore: 68 }, two).passed, false);
  eq(scoreQuiz({ ...QUIZ, passScore: 100 }, [[1], [0, 2], [0]]).passed, true);
});
test('scoreQuiz: پاسخ‌های ناقص و پیش‌فرض passScore=70 و بلوک خراب', () => {
  const r = scoreQuiz({ questions: QUIZ.questions }, [[1], [], [0]]);
  eq(r.complete, false); eq(r.passScore, 70); eq(r.score, 67); eq(r.passed, false, '۶۷ < ۷۰');
  eq(scoreQuiz({}, []).score, 0); eq(scoreQuiz(null, null).passed, false);
});

/* ───── اعتبارسنجی ───── */
test('validate quiz: ساختار درست پذیرفته و خطاهای رایج با مسیر دقیق گزارش می‌شوند', () => {
  eq(issues(quiz, QUIZ).length, 0);
  ok(issues(quiz, { ...QUIZ, id: undefined }).some((i) => i.code === 'block.idRequired'));
  ok(issues(quiz, { ...QUIZ, passScore: 0 }).some((i) => i.code === 'quiz.passScore'));
  ok(issues(quiz, { ...QUIZ, passScore: 50.5 }).some((i) => i.code === 'quiz.passScore'));
  const bad = (q) => issues(quiz, { ...QUIZ, questions: [q] });
  ok(bad({ text: 'x', options: ['a', 'b'], correct: [5] }).some((i) => i.code === 'quiz.correct'), 'ایندکس خارج از محدوده');
  ok(bad({ text: 'x', options: ['a', 'b'], correct: [-1] }).some((i) => i.code === 'quiz.correct'));
  ok(bad({ text: 'x', options: ['a', 'b'], correct: [0, 1] }).some((i) => i.code === 'quiz.single'), 'تک‌انتخابی با دو پاسخ');
  ok(bad({ text: 'x', multiple: true, options: ['a', 'b'], correct: [0, 0] }).some((i) => i.code === 'quiz.correct'), 'تکراری');
  ok(bad({ text: 'x', options: ['a'], correct: [0] }).some((i) => i.code === 'array.tooShort'), 'حداقل دو گزینه');
  ok(bad({ text: 'x', options: ['a', 'b'] }).length > 0, 'correct الزامی');
  ok(issues(quiz, { ...QUIZ, questions: [] }).length > 0);
  const bad2 = issues(quiz, { ...QUIZ, questions: [{ text: 'x', options: ['a', 'b'], correct: [9] }] });
  ok(bad2[0].path.includes('questions[0]'), bad2[0].path);
});
test('validate exercise/project: id الزامی، عنوان پروژه الزامی، criteria فقط برای project', () => {
  eq(issues(exercise, { type: 'exercise', id: 'e', items: ['a'] }).length, 0);
  ok(issues(exercise, { type: 'exercise', items: ['a'] }).some((i) => i.code === 'block.idRequired'));
  ok(issues(exercise, { type: 'exercise', id: 'e', items: [] }).length > 0);
  ok(issues(project, { type: 'project', id: 'p', items: ['a'] }).length > 0, 'title الزامی');
  eq(issues(project, { type: 'project', id: 'p', title: 'T', items: ['a'], criteria: ['c'] }).length, 0);
  const v = createValidator(); exercise.validate({ type: 'exercise', id: 'e', items: ['a'], criteria: ['c'] }, 'b', v);
  ok(v.issues.some((i) => i.level === 'warn'));
});
test('pack کامل: quiz با پاسخ نامعتبر باعث رد pack با مسیر دقیق می‌شود', () => {
  const p = JSON.parse(SAMPLE_TEXT);
  p.lessons['wrap-up'].blocks.find((b) => b.type === 'quiz').questions[0].correct = [9];
  const res = parsePack(JSON.stringify(p));
  eq(res.ok, false);
  ok(JSON.stringify(res.errors).includes('questions[0]'), JSON.stringify(res.errors));
});

/* ───── جست‌وجو ───── */
test('search: متن quiz/exercise/project قابل جست‌وجوست و نسخه ایندکس بالا رفته', () => {
  ok(INDEX_VERSION >= 2);
  const q = extractBlock({ type: 'quiz', id: 'q', questions: [{ text: 'سؤال ویژه', options: ['گزینه‌الف', 'ب'], correct: [0] }] });
  ok(q.text.includes('سؤال ویژه') && q.text.includes('گزینه‌الف'));
  ok(extractBlock({ type: 'project', id: 'p', title: 'T', items: ['مورد یک'], criteria: ['معیار'] }).text.includes('معیار'));
  ok(!JSON.stringify(extractBlock({ type: 'quiz', id: 'q', questions: [{ text: 'x', options: ['a', 'b'], correct: [1] }] })).includes('correct'));
});

/* ───── سرویس نتایج ───── */
test('results.saveQuiz: بهترین نمره، آخرین نمره، شمارش تلاش؛ نمره نامعتبر رد می‌شود', async () => {
  const e = await env();
  const k = { courseId: 'c', lessonId: 'l', blockId: 'q1' };
  let r = await e.results.saveQuiz({ ...k, score: 50 }); eq(r.best, 50); eq(r.attempts, 1);
  r = await e.results.saveQuiz({ ...k, score: 90 }); eq(r.best, 90); eq(r.last, 90); eq(r.attempts, 2);
  r = await e.results.saveQuiz({ ...k, score: 20 }); eq(r.best, 90, 'نمره بد بهترین را پایین نمی‌آورد'); eq(r.last, 20); eq(r.attempts, 3);
  for (const bad of [-1, 101, NaN, '80', null]) await rejectsWith(() => e.results.saveQuiz({ ...k, score: bad }), ResultError);
});
test('results.saveChecklist: پاک‌سازی ایندکس‌ها، حفظ متن قبلی، سقف طول، نوع نامعتبر', async () => {
  const e = await env();
  const k = { courseId: 'c', lessonId: 'l', blockId: 'p1', kind: 'project', total: 3 };
  let r = await e.results.saveChecklist({ ...k, checked: [2, 0, 0, 7, -1, 1.5], text: '  لینک  ' });
  eq(r.checked.join(','), '0,2'); eq(r.text, 'لینک');
  r = await e.results.saveChecklist({ ...k, checked: [0] });
  eq(r.text, 'لینک', 'text ارسال‌نشده پاک نمی‌شود');
  await rejectsWith(() => e.results.saveChecklist({ ...k, checked: [], text: 'x'.repeat(PROJECT_TEXT_MAX + 1) }), ResultError);
  await rejectsWith(() => e.results.saveChecklist({ ...k, kind: 'quiz', checked: [] }), ResultError);
});
test('results: ofLesson/ofCourse جدا هستند و با حذف دوره پاک می‌شوند', async () => {
  const e = await env();
  await e.svc.install(samplePack());
  await e.results.saveQuiz({ courseId: SID, lessonId: 'wrap-up', blockId: 'quiz-basics', score: 80 });
  await e.results.saveQuiz({ courseId: 'other', lessonId: 'wrap-up', blockId: 'quiz-basics', score: 10 });
  await e.results.saveChecklist({ courseId: SID, lessonId: 'prompts', blockId: 'ex-prompt', kind: 'exercise', checked: [0], total: 3 });
  eq((await e.results.ofCourse(SID)).length, 2);
  eq((await e.results.ofLesson(SID, 'wrap-up')).size, 1);
  eq((await e.results.ofLesson(SID, 'wrap-up')).get('quiz-basics').best, 80);
  await e.svc.remove(SID);
  eq((await e.results.ofCourse(SID)).length, 0);
  eq((await e.results.ofCourse('other')).length, 1, 'دوره دیگر دست‌نخورده');
});

/* ───── خلاصه ───── */
test('collect/summarize: شمارش قبولی، میانگین، تمرین کامل و داده خراب', () => {
  const a = collectAssessments(samplePack());
  eq(a.map((x) => x.type).sort().join(','), 'exercise,project,quiz');
  eq(a.find((x) => x.type === 'quiz').passScore, 60);
  const row = (blockId, lessonId, extra) => ({ blockId, lessonId, ...extra });
  let s = summarize(a, [row('quiz-basics', 'wrap-up', { best: 66 }), row('ex-prompt', 'prompts', { checked: [0, 1, 2] }), row('proj-final', 'wrap-up', { checked: [0, 1] })]);
  eq(s.quizzes.passed, 1); eq(s.quizzes.avgBest, 66); eq(s.exercises.done, 1); eq(s.projects.done, 0);
  s = summarize(a, [row('quiz-basics', 'wrap-up', { best: 59 })]);
  eq(s.quizzes.passed, 0, 'زیر حد قبولی'); eq(s.quizzes.attempted, 1);
  s = summarize(a, [row('ex-prompt', 'prompts', { checked: [0, 0, 0, 99, -1] })]);
  eq(s.exercises.done, 0, 'ایندکس تکراری/خارج از محدوده کامل حساب نمی‌شود');
  eq(summarize([], []).quizzes.total, 0);
  eq(collectAssessments({}).length, 0);
});

/* ───── رندر quiz ───── */
const pick = (el, q, o) => { const input = el.querySelectorAll('.quiz__q')[q].querySelectorAll('input')[o]; input.checked = true; input.dispatchEvent(new Event('change')); };
const mkResults = (saved = null) => {
  const calls = [];
  return { calls, get: () => saved, saveQuiz: async (id, score) => { calls.push(['quiz', id, score]); return { best: score, attempts: 1 }; }, saveChecklist: async (id, d) => { calls.push(['check', id, d]); return {}; } };
};
test('quiz render: ناقص → پیام و ذخیره نمی‌شود؛ کامل → نمره، بازخورد متنی، ذخیره', async () => {
  const res = mkResults();
  const el = quiz.render(QUIZ, { results: res });
  document.body.append(el);
  eq(el.querySelectorAll('.quiz__q').length, 3);
  eq(el.querySelectorAll('.quiz__q')[0].querySelectorAll('input[type=radio]').length, 3);
  eq(el.querySelectorAll('.quiz__q')[1].querySelectorAll('input[type=checkbox]').length, 3);
  el.querySelector('.btn--primary').click();
  ok(!el.querySelector('.save-error').hidden); eq(res.calls.length, 0);
  pick(el, 0, 1); pick(el, 1, 0); pick(el, 1, 2); pick(el, 2, 1); // آخری غلط
  el.querySelector('.btn--primary').click();
  await waitFor(() => res.calls.length === 1);
  eq(res.calls[0][2], 67);
  ok(el.querySelector('.quiz__result').textContent.includes('قبول شدید'));
  ok(el.querySelectorAll('.quiz__fb')[2].textContent.includes('نادرست'), 'وضعیت با متن');
  ok(!el.textContent.includes('null'), 'متن null در DOM');
  ok(el.querySelectorAll('.quiz__q')[2].querySelector('.is-correct'));
  ok(el.querySelectorAll('.quiz__q')[0].querySelector('input').disabled, 'بعد از ثبت قفل است');
  await waitFor(() => el.querySelector('.quiz__best').textContent.includes('۶۷'));
  el.remove();
});
test('quiz render: تلاش دوباره پاسخ‌ها را پاک و ذخیره‌ی دوم را انجام می‌دهد', async () => {
  const res = mkResults();
  const el = quiz.render(QUIZ, { results: res });
  document.body.append(el);
  const fill = () => { pick(el, 0, 1); pick(el, 1, 0); pick(el, 1, 2); pick(el, 2, 0); };
  fill(); el.querySelector('.btn--primary').click(); await waitFor(() => res.calls.length === 1);
  const retry = [...el.querySelectorAll('.quiz__actions .btn')].find((b) => !b.classList.contains('btn--primary'));
  ok(!retry.hidden); retry.click();
  eq(el.querySelectorAll('input:checked').length, 0);
  el.querySelector('.btn--primary').click(); // خالی → ذخیره نشود
  eq(res.calls.length, 1);
  fill(); el.querySelector('.btn--primary').click(); await waitFor(() => res.calls.length === 2);
  el.remove();
});
test('quiz render: خطای ذخیره نمره را نشان می‌دهد و پیام خطا می‌دهد؛ بدون results هم کار می‌کند', async () => {
  const el = quiz.render(QUIZ, { results: { get: () => null, saveQuiz: async () => { throw new Error('x'); } } });
  pick(el, 0, 1); pick(el, 1, 0); pick(el, 1, 2); pick(el, 2, 0);
  el.querySelector('.btn--primary').click();
  await waitFor(() => !el.querySelector('.save-error').hidden);
  ok(el.querySelector('.quiz__result').textContent.includes('۱۰۰'));
  const solo = quiz.render(QUIZ, {});
  pick(solo, 0, 1); pick(solo, 1, 0); pick(solo, 1, 2); pick(solo, 2, 0);
  solo.querySelector('.btn--primary').click();
  await waitFor(() => !solo.querySelector('.quiz__result').hidden);
});
test('quiz render: متن سؤال/گزینه HTML اجرا نمی‌کند و بهترین نتیجه قبلی نمایش داده می‌شود', () => {
  const evil = { type: 'quiz', id: 'q', questions: [{ text: '<img src=x onerror=alert(1)> **سؤال**', options: ['<b>x</b>', 'y'], correct: [0] }] };
  const el = quiz.render(evil, { results: { get: () => ({ best: 80, attempts: 3 }) } });
  eq(el.querySelectorAll('img').length, 0); eq(el.querySelectorAll('b').length, 0);
  ok(el.querySelector('.quiz__best').textContent.includes('۸۰') && el.querySelector('.quiz__best').textContent.includes('۳'));
});

/* ───── رندر exercise / project ───── */
test('exercise render: تیک‌ها ذخیره می‌شوند، شمارنده و حالت کامل، وضعیت قبلی بازیابی', async () => {
  const res = mkResults({ checked: [1], text: '' });
  const el = exercise.render({ type: 'exercise', id: 'e', items: ['a', 'b', 'c'] }, { results: res });
  const boxes = el.querySelectorAll('input[type=checkbox]');
  eq(boxes[1].checked, true); eq(boxes[0].checked, false);
  ok(el.querySelector('.check__count').textContent.includes('۱ از ۳'));
  boxes[0].checked = true; boxes[0].dispatchEvent(new Event('change'));
  await waitFor(() => res.calls.length === 1);
  eq([...res.calls[0][2].checked].sort().join(','), '0,1');
  boxes[2].checked = true; boxes[2].dispatchEvent(new Event('change'));
  await waitFor(() => res.calls.length === 2);
  ok(el.querySelector('.check__count').classList.contains('is-done'));
});
test('exercise render: ذخیره ناموفق تیک را برمی‌گرداند و خطا نشان می‌دهد', async () => {
  const el = exercise.render({ type: 'exercise', id: 'e', items: ['a', 'b'] }, { results: { get: () => null, saveChecklist: async () => { throw new Error('x'); } } });
  const box = el.querySelector('input');
  box.checked = true; box.dispatchEvent(new Event('change'));
  await waitFor(() => !el.querySelector('.save-error').hidden);
  eq(box.checked, false, 'نمایش با ذخیره یکی بماند');
  ok(el.querySelector('.check__count').textContent.includes('۰ از ۲'));
});
test('project render: معیارها، ذخیره توضیح، متن امن', async () => {
  const res = mkResults({ checked: [], text: 'لینک قبلی' });
  const el = project.render({ type: 'project', id: 'p', title: 'T', items: ['a'], criteria: ['<i>c</i>'] }, { results: res });
  eq(el.querySelector('textarea').value, 'لینک قبلی');
  eq(el.querySelectorAll('.project__criteria i').length, 0);
  el.querySelector('textarea').value = 'https://x.com';
  el.querySelector('.project__box .btn').click();
  await waitFor(() => res.calls.length === 1);
  eq(res.calls[0][2].text, 'https://x.com');
  await waitFor(() => el.querySelector('.check__saved').textContent.includes('ذخیره شد'));
});

/* ───── صفحه‌ها ───── */
test('lesson view: آزمون واقعی ذخیره می‌شود و بعد از ورود دوباره بهترین نتیجه می‌ماند', async () => {
  const e = await env(); await e.svc.install(samplePack());
  const r = await lessonView(e, 'wrap-up');
  document.body.append(r.el);
  const quizEl = r.el.querySelector('.blk-quiz');
  pick(quizEl, 0, 0); pick(quizEl, 1, 0); pick(quizEl, 1, 1); pick(quizEl, 2, 1);
  quizEl.querySelector('.btn--primary').click();
  await waitFor(async () => true);
  await waitFor(() => quizEl.querySelector('.quiz__best').textContent.includes('۱۰۰'));
  const saved = await e.results.ofLesson(SID, 'wrap-up');
  eq(saved.get('quiz-basics').best, 100);
  r.el.remove();
  const r2 = await lessonView(e, 'wrap-up');
  ok(r2.el.querySelector('.quiz__best').textContent.includes('۱۰۰'));
});
test('lesson view: تمرین و پروژه بعد از بازگشت به درس همان حالت را دارند', async () => {
  const e = await env(); await e.svc.install(samplePack());
  const r = await lessonView(e, 'prompts');
  const box = r.el.querySelector('.blk-exercise input');
  box.checked = true; box.dispatchEvent(new Event('change'));
  await waitFor(async () => (await e.results.ofLesson(SID, 'prompts')).size === 1);
  const r2 = await lessonView(e, 'prompts');
  eq(r2.el.querySelector('.blk-exercise input').checked, true);
});
test('lesson view: خرابی خواندن نتایج درس را خراب نمی‌کند', async () => {
  const e = await env(); await e.svc.install(samplePack());
  e.results.ofLesson = async () => { throw new Error('boom'); };
  const r = await lessonView(e, 'wrap-up');
  ok(r.el.querySelector('.blk-quiz'));
});
test('course view: پنل ارزیابی نتایج را نشان می‌دهد؛ بدون ارزیابی پنل نیست', async () => {
  const e = await env(); await e.svc.install(samplePack());
  let r = await renderCourse(view(e, { params: { id: SID } }));
  ok(r.el.querySelector('.assess-panel').textContent.includes('۰ از ۱ قبول'));
  await e.results.saveQuiz({ courseId: SID, lessonId: 'wrap-up', blockId: 'quiz-basics', score: 80 });
  r = await renderCourse(view(e, { params: { id: SID } }));
  const txt = r.el.querySelector('.assess-panel').textContent;
  ok(txt.includes('۱ از ۱ قبول') && txt.includes('۸۰'), txt);
  const p = JSON.parse(SAMPLE_TEXT); p.manifest.id = 'plain';
  for (const l of Object.values(p.lessons)) l.blocks = l.blocks.filter((b) => !['quiz', 'exercise', 'project'].includes(b.type));
  await e.svc.install(parsePack(JSON.stringify(p)).pack);
  r = await renderCourse(view(e, { params: { id: 'plain' } }));
  eq(r.el.querySelector('.assess-panel'), null);
});
test('dashboard: خط آزمون‌ها روی کارت دوره', async () => {
  const e = await env(); await e.svc.install(samplePack());
  await e.results.saveQuiz({ courseId: SID, lessonId: 'wrap-up', blockId: 'quiz-basics', score: 90 });
  const r = await renderDashboard(view(e));
  ok(r.el.querySelector('.course-card').textContent.includes('آزمون‌ها: ۱ از ۱'));
});

test('محافظ سراسری: هیچ صفحه‌ای متن «null» یا «undefined» نشان نمی‌دهد (باگ تکراری M3/M4/M5)', async () => {
  const e = await env(); await e.svc.install(samplePack());
  await e.notes.addNote({ courseId: SID, lessonId: 'intro', text: 'n', lessonTitle: 'L', courseTitle: 'C' });
  await e.notes.toggleBookmark({ courseId: SID, lessonId: 'intro' });
  const bad = (el, label) => { const tx = el.textContent; ok(!/\bnull\b|\bundefined\b|NaN/.test(tx), `${label}: ${tx.match(/.{0,20}(null|undefined|NaN).{0,20}/)}`); };
  for (const lid of ['intro', 'prompts', 'wrap-up']) bad((await lessonView(e, lid)).el, `lesson ${lid}`);
  bad((await renderCourse(view(e, { params: { id: SID } }))).el, 'course');
  bad((await renderDashboard(view(e))).el, 'dashboard');
  // بعد از ثبت آزمون (بازخورد/نتیجه ساخته می‌شود)
  const r = await lessonView(e, 'wrap-up');
  const q = r.el.querySelector('.blk-quiz');
  pick(q, 0, 1); pick(q, 1, 0); pick(q, 2, 0);
  q.querySelector('.btn--primary').click();
  await waitFor(() => !q.querySelector('.quiz__result').hidden);
  bad(r.el, 'quiz after submit');
});

export async function runTests({ sampleText } = {}) {
  SAMPLE_TEXT = sampleText;
  const results = [];
  for (const { name, fn } of tests) {
    try { await fn(); results.push({ name, ok: true }); } catch (err) { results.push({ name, ok: false, error: err.message }); }
  }
  return results;
}
