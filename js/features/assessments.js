// منطق خالص آزمون/تمرین/پروژه (بدون DOM و دیتابیس)
export const DEFAULT_PASS_SCORE = 70;
export const ASSESS_TYPES = ['quiz', 'exercise', 'project'];

const uniqSorted = (arr) => [...new Set(arr)].sort((a, b) => a - b);

// answers[i] = آرایه ایندکس گزینه‌های انتخاب‌شده برای سؤال i
// هر سؤال همه‌یا‌هیچ است: مجموعه پاسخ باید دقیقاً با مجموعه درست برابر باشد.
export function scoreQuiz(block, answers) {
  const questions = Array.isArray(block && block.questions) ? block.questions : [];
  const passScore = Number.isFinite(block && block.passScore) ? block.passScore : DEFAULT_PASS_SCORE;
  const perQuestion = questions.map((q, i) => {
    const chosen = uniqSorted(Array.isArray(answers && answers[i]) ? answers[i] : []);
    const correct = uniqSorted(q.correct || []);
    const ok = chosen.length === correct.length && chosen.every((v, k) => v === correct[k]);
    return { ok, chosen, correct, answered: chosen.length > 0 };
  });
  const correctCount = perQuestion.filter((p) => p.ok).length;
  const total = questions.length;
  const score = total ? Math.round((correctCount / total) * 100) : 0;
  return { score, correctCount, total, passScore, passed: total > 0 && score >= passScore, perQuestion, complete: perQuestion.every((p) => p.answered) };
}

// فهرست آزمون‌ها/تمرین‌ها/پروژه‌های یک دوره (به ترتیب درس‌ها در manifest)
export function collectAssessments(pack) {
  const out = [];
  const chapters = (pack && pack.manifest && pack.manifest.chapters) || [];
  for (const ch of chapters) {
    for (const ls of ch.lessons || []) {
      const lesson = pack.lessons && Object.prototype.hasOwnProperty.call(pack.lessons, ls.id) ? pack.lessons[ls.id] : null;
      for (const b of (lesson && Array.isArray(lesson.blocks) ? lesson.blocks : [])) {
        if (!b || !ASSESS_TYPES.includes(b.type) || typeof b.id !== 'string') continue;
        out.push({
          type: b.type, lessonId: ls.id, lessonTitle: ls.title, blockId: b.id, title: b.title || '',
          total: b.type === 'quiz' ? (b.questions || []).length : (b.items || []).length,
          passScore: b.type === 'quiz' ? (Number.isFinite(b.passScore) ? b.passScore : DEFAULT_PASS_SCORE) : null,
        });
      }
    }
  }
  return out;
}

// results: آرایه رکوردهای ذخیره‌شده همان دوره
export function summarize(assessments, results) {
  const byKey = new Map((results || []).map((r) => [`${r.lessonId}\u0000${r.blockId}`, r]));
  const s = {
    quizzes: { total: 0, passed: 0, attempted: 0, avgBest: 0 },
    exercises: { total: 0, done: 0 },
    projects: { total: 0, done: 0 },
  };
  let bestSum = 0;
  for (const a of assessments) {
    const r = byKey.get(`${a.lessonId}\u0000${a.blockId}`);
    if (a.type === 'quiz') {
      s.quizzes.total++;
      if (r && Number.isFinite(r.best)) {
        s.quizzes.attempted++; bestSum += r.best;
        if (r.best >= a.passScore) s.quizzes.passed++;
      }
    } else {
      const bucket = a.type === 'exercise' ? s.exercises : s.projects;
      bucket.total++;
      const checked = r && Array.isArray(r.checked) ? new Set(r.checked.filter((i) => Number.isInteger(i) && i >= 0 && i < a.total)).size : 0;
      if (a.total > 0 && checked >= a.total) bucket.done++;
    }
  }
  s.quizzes.avgBest = s.quizzes.attempted ? Math.round(bestSum / s.quizzes.attempted) : 0;
  return s;
}
