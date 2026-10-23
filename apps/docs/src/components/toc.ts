/** Right rail: "On this page" for the active section plus the base URL. */

import { createCopyButton } from "./code";
import { h } from "../lib/dom";
import { API_BASE } from "../spec";

interface TocSub {
  id: string;
  label: string;
}

interface TocSection {
  id: string;
  label: string;
  subs: TocSub[];
}

function collectToc(root: ParentNode): TocSection[] {
  return Array.from(root.querySelectorAll<HTMLElement>("[data-spy-id]")).map((section) => ({
    id: section.dataset.spyId ?? section.id,
    label: section.dataset.navLabel ?? section.id,
    subs: Array.from(section.querySelectorAll<HTMLElement>("[data-sub]"))
      .filter((el) => Boolean(el.id))
      .map((el) => ({ id: el.id, label: el.dataset.sub ?? el.id })),
  }));
}

export interface TocController {
  element: HTMLElement;
  setActive(id: string): void;
}

export function createToc(root: ParentNode): TocController {
  const sections = collectToc(root);
  let active = sections[0]?.id ?? "";
  const list = h("div", { class: "toc-list" });

  const render = (): void => {
    list.textContent = "";
    for (const section of sections) {
      const top = h("a", { class: "toc-top", href: `#${section.id}` }, section.label);
      top.classList.toggle("is-active", section.id === active);
      list.appendChild(top);
      if (section.id !== active) continue;
      for (const sub of section.subs) {
        list.appendChild(h("a", { class: "toc-sub", href: `#${sub.id}` }, sub.label));
      }
    }
  };
  render();

  const base = h(
    "div",
    { class: "toc-base" },
    h("p", { class: "toc-label" }, "Base URL"),
    h(
      "div",
      { class: "toc-base-row" },
      h("code", null, API_BASE),
      createCopyButton(() => API_BASE, { iconOnly: true, label: "Copy base URL" }),
    ),
    h("p", { class: "toc-note" }, "No auth · CORS *"),
  );

  const element = h(
    "div",
    { class: "toc" },
    h("p", { class: "toc-label" }, "On this page"),
    list,
    base,
  );

  return {
    element,
    setActive(id: string): void {
      if (id === active) return;
      active = id;
      render();
    },
  };
}
