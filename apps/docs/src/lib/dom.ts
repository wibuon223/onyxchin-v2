/** Tiny DOM helper. No virtual DOM, no framework, no HTML strings. */

export type Child = Node | string | number | null | undefined | false;

type Attrs = Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [key, value] of Object.entries(attrs)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") {
        el.className = String(value);
      } else if (key === "text") {
        el.textContent = String(value);
      } else if (key.startsWith("on") && typeof value === "function") {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
      } else if (value === true) {
        el.setAttribute(key, "");
      } else {
        el.setAttribute(key, String(value));
      }
    }
  }
  append(el, children);
  return el;
}

function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(typeof child === "string" || typeof child === "number"
      ? document.createTextNode(String(child))
      : child);
  }
}

/** Inline `code` spans inside plain prose. Backticks toggle the span. */
export function rich(text: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  const parts = text.split("`");
  parts.forEach((part, index) => {
    if (!part) return;
    if (index % 2 === 1) {
      frag.appendChild(h("code", { class: "inline-code" }, part));
    } else {
      frag.appendChild(document.createTextNode(part));
    }
  });
  return frag;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export type IconName =
  | "copy"
  | "check"
  | "chevron-down"
  | "chevron-right"
  | "menu"
  | "close"
  | "search"
  | "arrow-up-right";

const ICONS: Record<IconName, string[]> = {
  copy: [
    "M5.5 5.5h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1Z",
    "M3.5 10.5h-1a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v1",
  ],
  check: ["M3 8.6l3.1 3.1L13 4.6"],
  "chevron-down": ["M4 6.5l4 4 4-4"],
  "chevron-right": ["M6.5 4l4 4-4 4"],
  menu: ["M2.5 5h11", "M2.5 8h11", "M2.5 11h11"],
  close: ["M4 4l8 8", "M12 4l-8 8"],
  search: ["M7 2.8a4.2 4.2 0 1 0 0 8.4 4.2 4.2 0 0 0 0-8.4Z", "M10.2 10.2l3.3 3.3"],
  "arrow-up-right": ["M5 11L11 5", "M6 5h5v5"],
};

export function icon(name: IconName, cls = "icon"): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", cls);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.4");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  for (const d of ICONS[name]) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

export function methodPill(method: string): HTMLElement {
  return h("span", { class: `method method-${method.toLowerCase()}` }, method);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
