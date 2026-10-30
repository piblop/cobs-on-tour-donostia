import type { Settings, SettingsStore } from '../engine/settings.ts';
import { button, h } from './dom.ts';

/** Builds the settings panel content. Every control is a native button or slider. */
export function settingsPanel(store: SettingsStore, onDone: () => void): HTMLElement {
  const s = () => store.current;

  const toggle = (label: string, get: () => boolean, set: (v: boolean) => void, note?: string) => {
    const btn = h('button', { class: 'toggle', attrs: { type: 'button' } });
    const sync = () => {
      const on = get();
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'On' : 'Off';
    };
    btn.addEventListener('click', () => {
      set(!get());
      sync();
    });
    sync();
    const id = `set-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    btn.id = id;
    return h(
      'div',
      { class: 'setting-row' },
      h('label', { attrs: { for: id } }, label, note ? h('small', { text: note }) : null),
      btn,
    );
  };

  const choice = <T extends string | number>(label: string, options: Array<[T, string]>, get: () => T, set: (v: T) => void) => {
    const group = h('div', { class: 'choice', attrs: { role: 'group', 'aria-label': label } });
    const buttons = options.map(([value, text]) => {
      const b = h('button', { class: 'choice-btn', text, attrs: { type: 'button' } });
      b.addEventListener('click', () => {
        set(value);
        sync();
      });
      return { b, value };
    });
    const sync = () => buttons.forEach(({ b, value }) => b.setAttribute('aria-pressed', String(get() === value)));
    sync();
    group.append(...buttons.map((x) => x.b));
    return h('div', { class: 'setting-row stacked' }, h('span', { class: 'setting-label', text: label }), group);
  };

  const slider = (label: string, get: () => number, set: (v: number) => void, min = 0, max = 100, suffix = '%') => {
    const id = `set-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`;
    const out = h('output', { attrs: { for: id } });
    const input = h('input', { id, attrs: { type: 'range', min: String(min), max: String(max), step: '5' } });
    input.value = String(Math.round(get()));
    out.textContent = `${input.value}${suffix}`;
    input.addEventListener('input', () => {
      set(Number(input.value));
      out.textContent = `${input.value}${suffix}`;
    });
    return h('div', { class: 'setting-row stacked' }, h('label', { attrs: { for: id }, text: label }), h('div', { class: 'slider' }, input, out));
  };

  const vol = (k: keyof Settings['volumes']) => ({
    get: () => s().volumes[k] * 100,
    set: (v: number) => store.update({ volumes: { ...s().volumes, [k]: v / 100 } }),
  });

  const fullscreen = button('Toggle fullscreen', () => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  });
  if (!document.fullscreenEnabled) fullscreen.setAttribute('disabled', '');

  return h(
    'div',
    { class: 'settings' },
    h('h3', { text: 'Reading and comfort' }),
    choice<number>('Text size', [[1, 'A'], [1.15, 'A+'], [1.3, 'A++'], [1.5, 'A+++']], () => s().textScale, (v) => store.update({ textScale: v })),
    toggle('Caption bar', () => s().captionBar, (v) => store.update({ captionBar: v }), 'Show what the crew says along the bottom too'),
    toggle('High-contrast prompts', () => s().highContrastPrompts, (v) => store.update({ highContrastPrompts: v })),
    choice<Settings['reducedMotion']>('Reduced motion', [['system', 'Match device'], ['on', 'On'], ['off', 'Off']], () => s().reducedMotion, (v) => store.update({ reducedMotion: v })),
    toggle('Camera shake', () => s().cameraShake, (v) => store.update({ cameraShake: v }), 'Off by default'),
    h('h3', { text: 'Mini-games' }),
    toggle('Relaxed timing', () => s().relaxedTiming, (v) => store.update({ relaxedTiming: v }), 'Wider windows, slower pace, no pressure'),
    toggle('One-button mode', () => s().oneButton, (v) => store.update({ oneButton: v }), 'Every mini-game plays with a single button'),
    h('h3', { text: 'Sound' }),
    toggle('Mute everything', () => s().muted, (v) => store.update({ muted: v })),
    slider('Master volume', vol('master').get, vol('master').set),
    slider('Music', vol('music').get, vol('music').set),
    slider('Ambience', vol('ambience').get, vol('ambience').set),
    slider('Effects', vol('effects').get, vol('effects').set),
    h('h3', { text: 'Graphics' }),
    choice<Settings['quality']>('Quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], () => s().quality, (v) => store.update({ quality: v })),
    slider('Rendering resolution', () => s().resolutionScale * 100, (v) => store.update({ resolutionScale: v / 100 }), 50, 100),
    h('div', { class: 'stack' }, fullscreen, button('Done', onDone, 'btn primary')),
  );
}
