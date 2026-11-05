type Kid = Node | string | null | false;
type Props = {
  class?: string;
  text?: string;
  title?: string;
  type?: string;
  data?: Record<string, string>;
  pressed?: boolean;
};

// Builds elements with the DOM, so no text from the map is ever parsed as markup.
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Props = {},
  ...kids: Kid[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props.class) el.className = props.class;
  if (props.text !== undefined) el.textContent = props.text;
  if (props.title) el.title = props.title;
  if (props.type) el.setAttribute('type', props.type);
  if (props.pressed !== undefined) el.setAttribute('aria-pressed', String(props.pressed));
  for (const [k, v] of Object.entries(props.data ?? {})) el.dataset[k] = v;
  for (const kid of kids) if (kid) el.append(kid);
  return el;
}

export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
  parent?: Element,
): SVGElementTagNameMap[K] {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  parent?.append(el);
  return el;
}

export function byId<T extends Element>(id: string, type: new () => T): T {
  const el = document.getElementById(id);
  if (!(el instanceof type)) throw new Error(`#${id} is missing from the page`);
  return el;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
