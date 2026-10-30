/**
 * Minimal element builder. Text always goes through textContent, so player
 * captions and content strings can never inject markup.
 */
type Child = Node | string | null | undefined | false;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<{ class: string; id: string; text: string; attrs: Record<string, string>; on: Record<string, (e: Event) => void> }> = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.id) el.id = props.id;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.attrs) for (const [k, v] of Object.entries(props.attrs)) el.setAttribute(k, v);
  if (props.on) for (const [k, fn] of Object.entries(props.on)) el.addEventListener(k, fn);
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return el;
}

export function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  return h('button', { class: cls, text: label, attrs: { type: 'button' }, on: { click: () => onClick() } });
}

/** Keyboard/controller focus cycling inside a container. */
export function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex="0"]',
    ),
  );
}

export function moveFocus(root: HTMLElement, dir: 1 | -1): void {
  const list = focusables(root);
  if (list.length === 0) return;
  const i = list.indexOf(document.activeElement as HTMLElement);
  const next = list[(i + dir + list.length) % list.length];
  next.focus();
}

/** Keep Tab focus inside an open dialog. */
export function trapFocus(root: HTMLElement): () => void {
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const list = focusables(root);
    if (list.length === 0) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  root.addEventListener('keydown', onKey);
  return () => root.removeEventListener('keydown', onKey);
}

export function controlsList(): HTMLDListElement {
  const row = (keys: string[], what: string) => {
    const dt = h('dt');
    keys.forEach((k, i) => {
      if (i > 0) dt.append(' ');
      dt.append(h('kbd', { text: k }));
    });
    return [dt, h('dd', { text: what })];
  };
  return h(
    'dl',
    { class: 'controls' },
    ...row(['W', 'A', 'S', 'D'], 'Stroll (or arrow keys, or left stick)'),
    ...row(['Shift'], 'Walk briskly (or right trigger)'),
    ...row(['E'], 'Interact (or Space, or A button)'),
    ...row(['Scroll'], 'Zoom in and out (or + and -)'),
    ...row(['Z', 'C'], 'Turn the camera (or right-drag, or right stick)'),
    ...row(['X'], 'Reset the camera'),
    ...row(['Esc'], 'Pause (or Start button)'),
  );
}
