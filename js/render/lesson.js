// رندر بلوک‌های یک درس
import { defaultRegistry } from './blocks/index.js';

// copy (اختیاری): تابع کپی تزریقی برای بلوک پرامپت (در تست‌ها)
// results (اختیاری): ذخیره نتیجه آزمون/تمرین (ctx.results در assess.js)
// خروجی: DocumentFragment، یا null اگر درس وجود نداشته یا ساختارش معتبر نباشد.
export function renderLessonBlocks(pack, lessonId, { registry = defaultRegistry, assetUrl, copy, results } = {}) {
  const lessons = pack && pack.lessons;
  if (!lessons || !Object.prototype.hasOwnProperty.call(lessons, lessonId)) return null;
  const lesson = lessons[lessonId];
  if (!lesson || typeof lesson !== 'object' || !Array.isArray(lesson.blocks)) return null;
  return registry.renderBlocks(lesson.blocks, { assetUrl, copy, results });
}
