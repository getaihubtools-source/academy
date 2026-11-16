// بلوک‌های ارزیابی: quiz / exercise / project
// ذخیره‌سازی از طریق ctx.results (اختیاری): { get(blockId), saveQuiz(blockId, score), saveChecklist(blockId, {checked,text}) }
// بدون ctx.results بلوک‌ها فقط در حافظه کار می‌کنند (مثلاً در پیش‌نمایش).
import { h } from '../../core/dom.js';
import { t, toFaDigits } from '../../core/i18n-fa.js';
import { cleanText } from '../sanitize.js';
import { renderInline, renderParagraphs } from '../inline.js';
import { LIMITS } from '../check.js';
import { scoreQuiz, DEFAULT_PASS_SCORE } from '../../features/assessments.js';
import { PROJECT_TEXT_MAX } from '../../db/results.js';

let uid = 0;
const nextId = (p) => `${p}-${++uid}`;
const fa = toFaDigits;

function requireId(block, path, v) {
  if (typeof block.id !== 'string' || block.id === '') v.error('block.idRequired', `${path}.id`, 'این بلوک برای ذخیره نتیجه به شناسه (id) نیاز دارد');
}

/* ───────── quiz ───────── */
// { type:'quiz', id, title?, passScore?: 1..100 (پیش‌فرض ۷۰),
//   questions:[{ text, options:[متن]، correct:[ایندکس]، multiple?:bool, explanation? }] }
export const quiz = {
  validate(block, path, v) {
    requireId(block, path, v);
    v.str(block.title, `${path}.title`, { required: false, max: LIMITS.shortText });
    if (block.passScore !== undefined && !(Number.isInteger(block.passScore) && block.passScore >= 1 && block.passScore <= 100)) {
      v.error('quiz.passScore', `${path}.passScore`, 'passScore باید عدد صحیح ۱ تا ۱۰۰ باشد');
    }
    if (!v.arr(block.questions, `${path}.questions`, { min: 1, max: LIMITS.quizQuestions })) return;
    block.questions.forEach((q, i) => {
      const qp = `${path}.questions[${i}]`;
      if (!v.obj(q, qp)) return;
      v.str(q.text, `${qp}.text`, { max: LIMITS.text });
      v.str(q.explanation, `${qp}.explanation`, { required: false, max: LIMITS.text });
      v.bool(q.multiple, `${qp}.multiple`);
      const optsOk = v.arr(q.options, `${qp}.options`, { min: 2, max: LIMITS.quizOptions });
      if (optsOk) q.options.forEach((o, k) => v.str(o, `${qp}.options[${k}]`, { max: LIMITS.shortText }));
      if (!v.arr(q.correct, `${qp}.correct`, { min: 1, max: LIMITS.quizOptions })) return;
      const valid = q.correct.every((c) => Number.isInteger(c) && c >= 0 && (!optsOk || c < q.options.length));
      if (!valid) { v.error('quiz.correct', `${qp}.correct`, 'ایندکس گزینه درست نامعتبر است'); return; }
      if (new Set(q.correct).size !== q.correct.length) v.error('quiz.correct', `${qp}.correct`, 'ایندکس‌های تکراری');
      if (!q.multiple && q.correct.length !== 1) v.error('quiz.single', `${qp}.correct`, 'سؤال تک‌انتخابی باید دقیقاً یک پاسخ درست داشته باشد (برای چندانتخابی multiple:true بگذارید)');
    });
  },

  render(block, ctx) {
    const results = ctx && ctx.results;
    const questions = block.questions;
    const passScore = Number.isFinite(block.passScore) ? block.passScore : DEFAULT_PASS_SCORE;
    const answers = questions.map(() => new Set());
    const prev = results ? results.get(block.id) : null;
    let submitted = false;

    const summary = h('p', { class: 'quiz__best' });
    const paintBest = (rec) => {
      summary.textContent = rec && Number.isFinite(rec.best)
        ? t('quiz.best', { best: fa(rec.best), n: fa(rec.attempts || 1) })
        : '';
    };
    paintBest(prev);

    const result = h('div', { class: 'quiz__result', role: 'status', tabindex: '-1' });
    const error = h('p', { class: 'save-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn--primary', type: 'button' }, t('quiz.submit'));
    const retry = h('button', { class: 'btn', type: 'button', hidden: true }, t('quiz.retry'));

    const qEls = questions.map((q, qi) => {
      const multiple = Boolean(q.multiple);
      const name = nextId('q');
      const inputs = q.options.map((opt, oi) => {
        const id = nextId('o');
        const input = h('input', { type: multiple ? 'checkbox' : 'radio', name, id, value: String(oi) });
        input.addEventListener('change', () => {
          if (submitted) return;
          if (multiple) { if (input.checked) answers[qi].add(oi); else answers[qi].delete(oi); }
          else { answers[qi].clear(); answers[qi].add(oi); }
          error.hidden = true;
        });
        const label = h('label', { class: 'quiz__opt', for: id }, input, h('span', null, cleanText(opt)));
        return { input, label };
      });
      const feedback = h('div', { class: 'quiz__fb', hidden: true });
      const fieldset = h('fieldset', { class: 'quiz__q' },
        h('legend', null, h('span', { class: 'quiz__num' }, fa(qi + 1)), ' ', renderInline(q.text)),
        multiple ? h('p', { class: 'quiz__hint' }, t('quiz.multiple')) : null,
        ...inputs.map((x) => x.label), feedback);
      return { fieldset, inputs, feedback, q };
    });

    function lock(disabled) { for (const e of qEls) for (const { input } of e.inputs) input.disabled = disabled; }

    submit.addEventListener('click', async () => {
      const outcome = scoreQuiz(block, answers.map((s) => [...s]));
      if (!outcome.complete) { error.textContent = t('quiz.incomplete'); error.hidden = false; return; }
      error.hidden = true;
      submitted = true; lock(true); submit.disabled = true;

      qEls.forEach((e, i) => {
        const p = outcome.perQuestion[i];
        e.inputs.forEach(({ label }, oi) => {
          label.classList.toggle('is-correct', p.correct.includes(oi));
          label.classList.toggle('is-wrong', p.chosen.includes(oi) && !p.correct.includes(oi));
        });
        e.fieldset.classList.add(p.ok ? 'is-ok' : 'is-bad');
        // وضعیت همیشه با متن هم گفته می‌شود (نه فقط رنگ)
        e.feedback.replaceChildren(...[
          h('strong', null, p.ok ? t('quiz.correct') : t('quiz.wrong')),
          !p.ok ? h('span', null, ` ${t('quiz.answerWas', { a: p.correct.map((c) => cleanText(e.q.options[c])).join('، ') })}`) : null,
          e.q.explanation ? h('div', { class: 'quiz__expl' }, renderParagraphs(e.q.explanation)) : null,
        ].filter(Boolean)); // null در replaceChildren به متن «null» تبدیل می‌شود
        e.feedback.hidden = false;
      });

      result.replaceChildren(
        h('strong', null, t('quiz.score', { score: fa(outcome.score), ok: fa(outcome.correctCount), total: fa(outcome.total) })),
        h('span', null, ` — ${t(outcome.passed ? 'quiz.passed' : 'quiz.failed', { pass: fa(passScore) })}`));
      result.classList.toggle('is-passed', outcome.passed);
      result.hidden = false;
      retry.hidden = false;
      result.focus();

      if (results) {
        try { paintBest(await results.saveQuiz(block.id, outcome.score)); }
        catch (err) { console.error('[quiz] save failed', err); error.textContent = t('quiz.saveError'); error.hidden = false; }
      }
    });

    retry.addEventListener('click', () => {
      submitted = false;
      answers.forEach((s) => s.clear());
      for (const e of qEls) {
        e.fieldset.classList.remove('is-ok', 'is-bad');
        e.feedback.hidden = true;
        for (const { input, label } of e.inputs) { input.checked = false; label.classList.remove('is-correct', 'is-wrong'); }
      }
      lock(false); submit.disabled = false; retry.hidden = true; result.hidden = true; error.hidden = true;
      qEls[0].inputs[0].input.focus();
    });
    result.hidden = true;

    return h('section', { class: 'blk blk-quiz', 'aria-label': block.title ? cleanText(block.title) : t('quiz.title') },
      h('div', { class: 'blk-assess__head' },
        h('span', { class: 'badge' }, t('quiz.title')),
        block.title ? h('strong', null, cleanText(block.title)) : null),
      h('p', { class: 'quiz__meta' }, t('quiz.meta', { n: fa(questions.length), pass: fa(passScore) })),
      summary,
      ...qEls.map((e) => e.fieldset),
      error, result,
      h('div', { class: 'quiz__actions' }, submit, retry));
  },
};

/* ───────── exercise / project (چک‌لیست) ───────── */
// exercise: { type, id, title?, text?, items:[متن] }
// project : همان + criteria?:[متن] ؛ و کادر «توضیح/لینک خروجی من»
function checklist(kind) {
  return {
    validate(block, path, v) {
      requireId(block, path, v);
      v.str(block.title, `${path}.title`, { required: kind === 'project', max: LIMITS.shortText });
      v.str(block.text, `${path}.text`, { required: false, max: LIMITS.text });
      if (v.arr(block.items, `${path}.items`, { min: 1, max: LIMITS.checkItems })) {
        block.items.forEach((it, i) => v.str(it, `${path}.items[${i}]`, { max: LIMITS.shortText }));
      }
      if (block.criteria !== undefined) {
        if (kind !== 'project') v.warn('block.criteria', `${path}.criteria`, 'criteria فقط برای project استفاده می‌شود');
        else if (v.arr(block.criteria, `${path}.criteria`, { max: LIMITS.checkItems })) {
          block.criteria.forEach((it, i) => v.str(it, `${path}.criteria[${i}]`, { max: LIMITS.shortText }));
        }
      }
    },

    render(block, ctx) {
      const results = ctx && ctx.results;
      const prev = results ? results.get(block.id) : null;
      const total = block.items.length;
      const checked = new Set(prev && Array.isArray(prev.checked) ? prev.checked.filter((i) => Number.isInteger(i) && i >= 0 && i < total) : []);
      let savedText = prev && typeof prev.text === 'string' ? prev.text : '';

      const count = h('p', { class: 'check__count', role: 'status' });
      const error = h('p', { class: 'save-error', role: 'alert', hidden: true });
      const paintCount = () => {
        count.textContent = checked.size >= total ? t('check.allDone') : t('check.count', { done: fa(checked.size), total: fa(total) });
        count.classList.toggle('is-done', checked.size >= total);
      };

      const persist = async (text) => {
        if (!results) return true;
        try {
          await results.saveChecklist(block.id, { kind, checked: [...checked], total, text });
          error.hidden = true;
          return true;
        } catch (err) {
          console.error('[assess] save failed', err);
          error.textContent = t('check.saveError'); error.hidden = false;
          return false;
        }
      };

      const items = block.items.map((text, i) => {
        const id = nextId('c');
        const input = h('input', { type: 'checkbox', id, checked: checked.has(i) });
        input.addEventListener('change', async () => {
          if (input.checked) checked.add(i); else checked.delete(i);
          paintCount();
          const okSaved = await persist(undefined);
          if (!okSaved) { // ذخیره نشد: وضعیت را به حالت قبل برگردان تا نمایش با واقعیت یکی باشد
            if (input.checked) checked.delete(i); else checked.add(i);
            input.checked = !input.checked; paintCount();
          }
        });
        return h('li', null, h('label', { class: 'check__item', for: id }, input, h('span', null, cleanText(text))));
      });
      paintCount();

      let projectBox = null;
      if (kind === 'project') {
        const taId = nextId('pt');
        const ta = h('textarea', { id: taId, class: 'notes__input', rows: 3, maxlength: PROJECT_TEXT_MAX, placeholder: t('project.placeholder') }, savedText);
        const status = h('span', { class: 'check__saved', role: 'status' });
        const save = h('button', {
          class: 'btn btn--sm', type: 'button',
          onclick: async () => {
            save.disabled = true;
            if (await persist(ta.value)) { savedText = ta.value.trim(); status.textContent = t('project.saved'); }
            save.disabled = false;
          },
        }, t('project.save'));
        projectBox = h('div', { class: 'project__box' }, h('label', { for: taId }, t('project.label')), ta, h('div', { class: 'note__foot' }, status, save));
      }

      return h('section', { class: `blk blk-assess blk-${kind}`, 'aria-label': block.title ? cleanText(block.title) : t(`${kind}.title`) },
        h('div', { class: 'blk-assess__head' },
          h('span', { class: 'badge' }, t(`${kind}.title`)),
          block.title ? h('strong', null, cleanText(block.title)) : null),
        block.text ? renderParagraphs(block.text) : null,
        h('ul', { class: 'check__list' }, ...items),
        count, error,
        kind === 'project' && Array.isArray(block.criteria) && block.criteria.length
          ? h('div', { class: 'project__criteria' }, h('h3', null, t('project.criteria')), h('ul', null, ...block.criteria.map((c) => h('li', null, cleanText(c)))))
          : null,
        projectBox);
    },
  };
}

export const exercise = checklist('exercise');
export const project = checklist('project');
