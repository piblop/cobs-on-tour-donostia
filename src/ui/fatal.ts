import { h } from './dom.ts';

/**
 * Friendly stop screen. In development it shows the technical detail; in
 * production it keeps to plain words.
 */
export function showFatal(title: string, message: string, detail?: string): void {
  document.getElementById('loading')?.classList.add('done');
  const box = h(
    'div',
    { class: 'fatal paper', attrs: { role: 'alert' } },
    h('h1', { text: title }),
    h('p', { text: message }),
    import.meta.env.DEV && detail ? h('pre', { text: detail }) : null,
    h('p', {}, h('button', { class: 'btn', text: 'Reload', attrs: { type: 'button' }, on: { click: () => location.reload() } })),
  );
  document.body.append(box);
}
