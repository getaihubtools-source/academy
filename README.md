# AIhub Academy — نسخه M7

## اجرا
- در VS Code افزونه **Live Server** را نصب کنید و `index.html` را با Open with Live Server باز کنید.
  (باز کردن مستقیم با دوبار کلیک کار نمی‌کند؛ ES Module ها به وب‌سرور نیاز دارند.)
- یا: `npm run serve` (آدرس: http://localhost:5173)

## تست
- Node: `npm install` سپس `npm test` (فقط تست‌ها devDependency دارند؛ خود برنامه هیچ وابستگی ندارد)
- مرورگر: صفحه `tests/index.html` را با همان وب‌سرور باز کنید.

## ساختار
```
index.html            # پوسته + CSP
css/                  # aihub.bundle(DS) · tokens(نگاشت) · base · components · views · courses · blocks · tools · assess · backup
js/app.js             # نقطه ورود، جدول route ها
js/core/              # events · store · router · dom(امن) · icons · i18n-fa · prefs · config
js/db/                # schema(migration) · idb · repos
js/views/             # shell · dashboard · library · settings · notfound
tests/                # m1.test.js (مشترک Node/مرورگر)
```

## قواعد
- هرگز `innerHTML`؛ همه DOM با `h()` از `js/core/dom.js`.
- تغییر ساختار DB = افزودن migration جدید به انتهای `js/db/schema.js` (قدیمی‌ها ویرایش نمی‌شوند).
- صفحه جدید = یک ماژول در `js/views/` + یک خط در `ROUTES` (`js/app.js`).
- متن‌های UI فقط در `js/core/i18n-fa.js`.

## پشتیبان‌گیری و بازیابی (M7)
- تنظیمات ← «پشتیبان‌گیری و بازیابی»: فقط داده کاربر (پیشرفت، یادداشت، نشان، نتایج آزمون/تمرین، تنظیمات) در یک JSON. خود دوره‌ها و لایسنس‌ها داخل پشتیبان نیستند.
- بازیابی: «ادغام» (پیش‌فرض؛ رکورد تازه‌تر می‌ماند، بهترین نمره آزمون حفظ می‌شود) یا «جایگزینی کامل» (با تأیید دوم). یک رکورد خراب = رد کل فایل؛ بازیابی در یک تراکنش اتمیک است.

## PWA و کار آفلاین (M7)
- `manifest.webmanifest` + `sw.js` (پیش‌کش همه فایل‌های برنامه با نسخه محتوا-محور).
- **بعد از هر تغییر در فایل‌های برنامه (js/css/fonts/icons/index.html/manifest) حتماً `npm run build:sw` را اجرا کنید** تا `sw.js` نسخه جدید بگیرد؛ تست `m7-build` اگر فراموش شود خطا می‌دهد.
- نسخه جدید فقط با تأیید کاربر (نوار «به‌روزرسانی») فعال می‌شود.
- SW فقط روی HTTPS یا localhost کار می‌کند؛ روی `file://` برنامه عادی اجرا می‌شود ولی آفلاین-نصب‌پذیر نیست.
- GitHub Pages (آدرس زیرمسیر مثل `user.github.io/aihub-academy/`): همه مسیرها نسبی‌اند (`./`)، تنظیم اضافه لازم نیست. فایل‌های `tests/`، `tools/`، `sample-pack/` را هم می‌توان منتشر نکرد.
- PWABuilder: آدرس منتشرشده را بدهید؛ manifest، آیکن‌های ۱۹۲/۵۱۲/maskable و SW شرایط را دارند.
- بازسازی آیکن‌ها: `python3 tools/build-icons.py`.

## دیزاین‌سیستم (AIhub DS v1.1)
- `css/aihub.bundle.css` و `js/aihub.bundle.js` بدون تغییر منطق از پروژه DS آمده‌اند (فقط مسیر فونت و استایل inline تولتیپ چارت برای CSP اصلاح شده).
- فایل‌های CSS برنامه فقط از توکن‌های DS استفاده می‌کنند؛ رنگ/اندازه hardcode نکنید.
- شِل: sidebar (دسکتاپ) · rail (تبلت) · bottom-nav + drawer (موبایل) · پالت دستور Ctrl/⌘+K یا `/`.
- تم: `data-theme` + `localStorage.aihub-theme` (پیش‌فرض: مطابق سیستم).
- آیکن‌ها: sprite داخل `index.html`؛ `icon(name)` در `js/core/icons.js`.
- بعد از هر تغییر: `npm run build:sw && npm test`.
