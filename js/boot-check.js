// اسکریپت کلاسیک کوچک: اگر index.html مستقیم با file:// باز شده باشد، ES Module ها لود نمی‌شوند.
// این پیام راهنما را نشان می‌دهد (روی هاست/Live Server اثری ندارد).
(function () {
  if (location.protocol !== 'file:') return;
  var boot = document.getElementById('boot');
  if (boot) boot.textContent = 'برای اجرا، پروژه را با یک وب‌سرور محلی باز کنید (مثلاً افزونه Live Server در VS Code)، نه با دوبار کلیک روی فایل.';
})();
