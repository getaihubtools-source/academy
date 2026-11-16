// ذخیره نتیجه آزمون‌ها و وضعیت تمرین/پروژه (store: quizResults)
import { reqP, txDone } from './idb.js';

export const PROJECT_TEXT_MAX = 2000;
const SEP = '\u0000';
export const resultKey = (courseId, lessonId, blockId) => [courseId, lessonId, blockId].join(SEP);

export class ResultError extends Error {
  constructor(code) { super(code); this.name = 'ResultError'; this.code = code; }
}

export function createResultsService(db) {
  async function upsert(key, base, merge) {
    const tx = db.transaction('quizResults', 'readwrite');
    const store = tx.objectStore('quizResults');
    const prev = await reqP(store.get(key));
    const record = merge(prev || null, { id: key, ...base });
    store.put(record);
    await txDone(tx);
    return record;
  }

  return {
    // score: ۰..۱۰۰ ؛ بهترین نمره و تعداد تلاش‌ها نگه داشته می‌شود
    async saveQuiz({ courseId, lessonId, blockId, score }) {
      if (!Number.isFinite(score) || score < 0 || score > 100) throw new ResultError('badScore');
      return upsert(resultKey(courseId, lessonId, blockId), { courseId, lessonId, blockId, kind: 'quiz' }, (prev, base) => ({
        ...base,
        last: score,
        best: prev && Number.isFinite(prev.best) ? Math.max(prev.best, score) : score,
        attempts: (prev && prev.attempts ? prev.attempts : 0) + 1,
        updatedAt: Date.now(),
      }));
    },

    // checked: ایندکس موارد انجام‌شده؛ text فقط برای پروژه
    async saveChecklist({ courseId, lessonId, blockId, kind, checked, total, text }) {
      if (kind !== 'exercise' && kind !== 'project') throw new ResultError('badKind');
      const clean = [...new Set((checked || []).filter((i) => Number.isInteger(i) && i >= 0 && i < total))].sort((a, b) => a - b);
      if (typeof text === 'string' && text.length > PROJECT_TEXT_MAX) throw new ResultError('tooLong');
      return upsert(resultKey(courseId, lessonId, blockId), { courseId, lessonId, blockId, kind }, (prev, base) => ({
        ...base,
        checked: clean,
        text: typeof text === 'string' ? text.trim() : (prev && prev.text) || '',
        updatedAt: Date.now(),
      }));
    },

    async ofLesson(courseId, lessonId) {
      const rows = await this.ofCourse(courseId);
      return new Map(rows.filter((r) => r.lessonId === lessonId).map((r) => [r.blockId, r]));
    },

    async ofCourse(courseId) {
      const tx = db.transaction('quizResults', 'readonly');
      return reqP(tx.objectStore('quizResults').index('courseId').getAll(courseId));
    },
  };
}
