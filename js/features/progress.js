// منطق خالص پیشرفت (بدون DOM و DB؛ کاملاً قابل تست)
// progress: Map<lessonId, { status: 'started'|'done', updatedAt }>

// lessonIds: آرایه شناسه درس‌های فعلی دوره (رکوردهای یتیم از نسخه‌های قدیمی‌تر حساب نمی‌شوند)
export function courseStats(lessonIds, progress) {
  let done = 0;
  let started = 0;
  const marks = []; // وضعیت هر درس به ترتیب: 'done' | 'started' | null (برای تایم‌لاین کلیدفریم)
  for (const id of lessonIds) {
    const rec = progress.get(id);
    if (!rec) { marks.push(null); continue; }
    if (rec.status === 'done') { done++; marks.push('done'); }
    else { started++; marks.push('started'); }
  }
  const total = lessonIds.length;
  return { total, done, started, percent: total ? Math.round((done / total) * 100) : 0, marks };
}

// index: خروجی lessonIndex(pack) (به ترتیب). خروجی:
//   { kind: 'start',  lesson }  هنوز چیزی شروع نشده → درس اول
//   { kind: 'resume', lesson }  آخرین درس لمس‌شده هنوز تمام نشده
//   { kind: 'next',   lesson }  آخرین درس تمام شده → نخستین درس انجام‌نشده
//   { kind: 'review', lesson }  همه تمام شده → مرور از درس اول
//   null                        دوره بدون درس
export function resumeTarget(index, progress) {
  if (!index.length) return null;

  let last = null;
  for (const lesson of index) {
    const rec = progress.get(lesson.lessonId);
    if (rec && (!last || rec.updatedAt > last.rec.updatedAt)) last = { lesson, rec };
  }
  if (!last) return { kind: 'start', lesson: index[0] };
  if (last.rec.status !== 'done') return { kind: 'resume', lesson: last.lesson };

  const isOpen = (l) => progress.get(l.lessonId)?.status !== 'done';
  const from = index.indexOf(last.lesson);
  const next = index.slice(from + 1).find(isOpen) || index.find(isOpen);
  return next ? { kind: 'next', lesson: next } : { kind: 'review', lesson: index[0] };
}

// درس قبلی/بعدی در ترتیب کلی دوره (مستقل از مرز فصل‌ها)
export function neighbors(index, lessonId) {
  const i = index.findIndex((l) => l.lessonId === lessonId);
  if (i === -1) return { prev: null, next: null, position: 0, total: index.length };
  return { prev: index[i - 1] || null, next: index[i + 1] || null, position: i + 1, total: index.length };
}
