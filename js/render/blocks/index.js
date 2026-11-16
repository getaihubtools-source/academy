// ثبت بلوک‌های پایه در registry پیش‌فرض
import { createRegistry } from '../registry.js';
import { heading } from './heading.js';
import { text } from './text.js';
import { list } from './list.js';
import { image } from './image.js';
import { prompt } from './prompt.js';
import { steps } from './steps.js';
import { comparison } from './comparison.js';
import { callout } from './callout.js';
import { video } from './video.js';
import { tool } from './tool.js';
import { quiz, exercise, project } from './assess.js';

export const CORE_BLOCKS = { heading, text, list, image, prompt, steps, comparison, callout, video, tool, quiz, exercise, project };

export function createDefaultRegistry() {
  const registry = createRegistry();
  for (const [type, def] of Object.entries(CORE_BLOCKS)) registry.register(type, def);
  return registry;
}

export const defaultRegistry = createDefaultRegistry();
