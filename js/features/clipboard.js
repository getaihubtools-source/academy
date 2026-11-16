// کپی متن در کلیپ‌بورد با fallback (Clipboard API فقط در https/localhost کار می‌کند)
// خروجی: Promise<boolean>
export async function copyText(text, { nav = globalThis.navigator, doc = globalThis.document } = {}) {
  const value = typeof text === 'string' ? text : '';

  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try { await nav.clipboard.writeText(value); return true; } catch { /* به fallback می‌رویم */ }
  }

  // fallback: textarea موقت + execCommand (مرورگرهای قدیمی، http، WebView برخی گوشی‌ها)
  if (!doc || !doc.body || typeof doc.execCommand !== 'function') return false;
  const area = doc.createElement('textarea');
  area.value = value;
  area.setAttribute('readonly', '');
  area.setAttribute('aria-hidden', 'true');
  area.style.cssText = 'position:fixed;top:0;inset-inline-start:-9999px;opacity:0;';
  doc.body.appendChild(area);
  try {
    area.focus();
    area.select();
    area.setSelectionRange(0, value.length);
    return Boolean(doc.execCommand('copy'));
  } catch {
    return false;
  } finally {
    area.remove();
  }
}
