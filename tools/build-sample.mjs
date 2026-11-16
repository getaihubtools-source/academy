// ساخت pack نمونه (فقط برای توسعه/تست):  node tools/build-sample.mjs
// خروجی: sample-pack/sample-course.json — شامل هر ۱۰ نوع بلوک و یک تصویر PNG تولیدشده در همین اسکریپت.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

/* ---------- تولید PNG ساده (گرادیان سرمه‌ای → فیروزه‌ای با خطوط شبکه) ---------- */
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
};

function makePng(w, h) {
  const rows = [];
  for (let y = 0; y < h; y++) {
    const row = Buffer.alloc(1 + w * 3); // بایت اول: filter = 0
    for (let x = 0; x < w; x++) {
      const t = x / (w - 1);
      const grid = x % 40 === 0 || y % 40 === 0 ? 28 : 0;
      row[1 + x * 3] = Math.min(255, Math.round(5 + 29 * t) + grid);
      row[2 + x * 3] = Math.min(255, Math.round(11 + 214 * t * (0.6 + 0.4 * (y / h))) + grid);
      row[3 + x * 3] = Math.min(255, Math.round(31 + 177 * t) + grid);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8-bit RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ---------- محتوای نمونه ---------- */
const pack = {
  schemaVersion: 1,
  manifest: {
    id: 'sample-motion-lab',
    title: 'نمونه رایگان: مقدمه‌ای بر موشن‌گرافیک',
    subtitle: 'بسته نمونه برای آزمایش موتور AIhub Academy',
    description: 'این بسته فقط برای تست موتور و نمایش انواع بلوک‌ها ساخته شده است و محتوای آموزشی نهایی نیست.',
    author: 'AIhub',
    language: 'fa',
    version: '0.1.0',
    chapters: [
      {
        id: 'basics',
        title: 'فصل ۱: آشنایی',
        lessons: [
          { id: 'intro', title: 'موشن‌گرافیک چیست؟', minutes: 8, free: true },
          { id: 'prompts', title: 'پرامپت و ابزارها', minutes: 12 },
        ],
      },
      {
        id: 'wrap',
        title: 'فصل ۲: جمع‌بندی',
        lessons: [{ id: 'wrap-up', title: 'مسیر بعدی', minutes: 5 }],
      },
    ],
  },
  lessons: {
    intro: {
      blocks: [
        { type: 'heading', id: 'h-what', text: 'موشن‌گرافیک چیست؟' },
        {
          type: 'text',
          text: 'موشن‌گرافیک یعنی **حرکت‌دادن عناصر گرافیکی** مثل متن، شکل و آیکن در طول زمان، تا یک پیام ساده‌تر و جذاب‌تر منتقل شود.\n\nدر این درس نمونه، هر بخش یک *بلوک محتوایی* است. برای مثال، نرم‌شدن حرکت با مفهوم `ease-in-out` توصیف می‌شود. برای اطلاعات بیشتر [این پیوند نمونه](https://example.com/motion) را ببینید.',
        },
        { type: 'callout', variant: 'tip', text: 'هر انیمیشن خوب با یک پیام شروع می‌شود. اول پیام را در یک جمله بنویسید، بعد حرکت را طراحی کنید.' },
        {
          type: 'list',
          items: [
            '**زمان‌بندی (Timing):** سرعت و ریتم حرکت',
            '**شتاب (Easing):** نرم‌شدن شروع و پایان حرکت',
            { text: '**ترکیب‌بندی:**', items: ['جایگاه عناصر', 'فضای خالی و تعادل'] },
          ],
        },
        { type: 'image', asset: 'sample-gradient', alt: 'گرادیان فیروزه‌ای به آبی روی زمینه سرمه‌ای با خطوط شبکه (تصویر نمونه)', caption: 'تصویر نمونه برای نمایش بلوک تصویر' },
        { type: 'video', title: 'نمونه پیوند ویدئو', url: 'https://example.com/sample-video' },
      ],
    },
    prompts: {
      blocks: [
        { type: 'heading', text: 'پرامپت‌های آماده' },
        {
          type: 'prompt',
          id: 'p-script',
          title: 'ایده‌پردازی اسکریپت',
          text: 'یک اسکریپت ۳۰ ثانیه‌ای برای موشن‌گرافیک درباره [موضوع] بنویس.\nخروجی را به‌صورت صحنه‌به‌صحنه بده: عنوان صحنه، مدت، متن روی صفحه، نوع حرکت.',
          note: 'به‌جای **[موضوع]** موضوع خودتان را بنویسید.',
        },
        {
          type: 'prompt',
          id: 'p-script-en',
          lang: 'en',
          title: 'English version',
          text: 'Write a 30-second motion graphics script about [TOPIC].\nReturn scenes as a table: scene, duration, on-screen text, motion.',
        },
        {
          type: 'steps',
          title: 'مسیر ساخت یک موشن ساده',
          items: [
            { title: 'پیام را مشخص کنید', text: 'پیام اصلی را در **یک جمله** بنویسید.' },
            { title: 'اسکریپت و صحنه‌ها', text: 'با کمک هوش مصنوعی صحنه‌ها و زمان‌بندی را پیش‌نویس کنید.' },
            { title: 'طراحی حرکت', text: 'برای هر صحنه نوع حرکت و `easing` را انتخاب کنید.' },
            { title: 'خروجی و بازبینی', text: 'خروجی را بررسی و اصلاح کنید.' },
          ],
        },
        {
          type: 'tool',
          id: 'tool-claude',
          name: 'Claude',
          description: 'دستیار هوش مصنوعی برای نوشتن اسکریپت، چیدن صحنه‌ها و تولید **کد یا JSON** انیمیشن.',
          pricing: 'freemium',
          bestFor: 'پیش‌نویس اسکریپت و ساخت ساختار انیمیشن',
          pros: ['پشتیبانی از زبان فارسی', 'تولید خروجی ساختاریافته (JSON/کد)'],
          cons: ['نسخه رایگان محدودیت تعداد پیام دارد', 'خروجی نیاز به بازبینی انسانی دارد'],
          url: 'https://claude.ai',
        },
        {
          type: 'exercise', id: 'ex-prompt', title: 'تمرین: پرامپت اول شما',
          text: 'این تمرین‌ها را **خودتان** انجام دهید؛ هر مورد را که تمام کردید تیک بزنید.',
          items: ['موضوع یک موشن ۳۰ ثانیه‌ای را انتخاب کنید', 'پرامپت اسکریپت را با موضوع خودتان کپی و اجرا کنید', 'خروجی را در یک جمله بازبینی کنید'],
        },
        {
          type: 'comparison',
          title: 'انتخاب مسیر ساخت (نمونه)',
          columns: ['ساخت با کد/JSON', 'ابزار ویدئوی آماده'],
          highlight: 0,
          rows: [
            { label: 'کنترل روی جزئیات', cells: ['بالا', 'متوسط'] },
            { label: 'سرعت شروع', cells: ['متوسط', 'بالا'] },
            { label: 'نیاز به مهارت فنی', cells: ['کم تا **متوسط**', 'کم'] },
          ],
        },
      ],
    },
    'wrap-up': {
      blocks: [
        { type: 'heading', level: 3, text: 'جمع‌بندی' },
        { type: 'text', text: 'در این نمونه همه نوع بلوک‌های پایه را دیدید. محتوای دوره‌های واقعی با همین بلوک‌ها ساخته می‌شود.' },
        { type: 'callout', variant: 'warning', title: 'توجه', text: 'این بسته فقط برای آزمایش موتور است و محتوای آموزشی نهایی نیست.' },
        { type: 'list', ordered: true, items: ['پیام را مشخص کنید', 'صحنه‌ها را بنویسید', 'حرکت را طراحی کنید'] },
        {
          type: 'quiz', id: 'quiz-basics', title: 'آزمون کوتاه فصل‌ها', passScore: 60,
          questions: [
            { text: 'موشن‌گرافیک یعنی چه؟', options: ['حرکت‌دادن عناصر گرافیکی در طول زمان', 'عکاسی از متن', 'ضبط صدا'], correct: [0], explanation: 'موشن‌گرافیک **حرکت** عناصر گرافیکی است.' },
            { text: 'کدام‌ها از اجزای حرکت هستند؟ (چند پاسخ)', multiple: true, options: ['زمان‌بندی', 'شتاب (easing)', 'رنگ دیوار اتاق'], correct: [0, 1] },
            { text: 'اولین قدم ساخت یک موشن چیست؟', options: ['انتخاب موسیقی', 'مشخص‌کردن پیام', 'خروجی گرفتن'], correct: [1] },
          ],
        },
        {
          type: 'project', id: 'proj-final', title: 'پروژه نهایی (نمونه)',
          text: 'یک موشن‌گرافیک ۳۰ ثانیه‌ای کامل بسازید.',
          items: ['پیام اصلی نوشته شد', 'اسکریپت صحنه‌به‌صحنه آماده شد', 'خروجی نهایی گرفته شد'],
          criteria: ['پیام در ۳ ثانیه اول مشخص است', 'حرکت‌ها نرم و هماهنگ‌اند'],
        },
      ],
    },
  },
  assets: {
    'sample-gradient': { mime: 'image/png', data: makePng(320, 180).toString('base64') },
  },
};

writeFileSync(new URL('../sample-pack/sample-course.json', import.meta.url), JSON.stringify(pack, null, 2) + '\n');
console.log('sample-pack/sample-course.json written');
