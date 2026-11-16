// آیکن‌ها: از sprite داخل index.html (icons.sprite از AIhub Design System + چند آیکن مخصوص آکادمی)
// استفاده: icon('home') یا icon('home', { size: 18 })
import { svg } from './dom.js';

const MAP = {
  home: 'i-home', library: 'i-book', settings: 'i-gear', spark: 'i-sparkle', alert: 'i-alert', info: 'i-info',
  search: 'i-search', bookmark: 'i-bookmark', note: 'i-note', copy: 'i-copy', bulb: 'i-bulb', play: 'i-play',
  external: 'i-external', database: 'i-database', upload: 'i-upload', download: 'i-download', clock: 'i-clock',
  layers: 'i-layers', trophy: 'i-trophy', target: 'i-target', check: 'i-check', plus: 'i-plus', close: 'i-x',
  back: 'i-arrow', next: 'i-arrow-r', moon: 'i-moon', sun: 'i-sun', command: 'i-command', menu: 'i-menu',
  trash: 'i-trash', edit: 'i-edit', offline: 'i-wifi-off', list: 'i-list', image: 'i-image', palette: 'i-palette',
  chart: 'i-chart', panel: 'i-panel', user: 'i-user', more: 'i-more',
};

export function icon(name, { size } = {}) {
  const id = MAP[name];
  if (!id) throw new Error(`Unknown icon: ${name}`);
  const el = svg([{ tag: 'use', attrs: { href: `#${id}` } }], {
    class: 'ico', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
  });
  if (size) { el.style.setProperty('width', `${size}px`); el.style.setProperty('height', `${size}px`); }
  return el;
}

export const ICON_NAMES = Object.keys(MAP);
