/** Client-side endpoint search: header input, `/` hotkey, DOM filtering. */

import { h, icon } from "../lib/dom";
import type { NavController } from "./nav";

export interface SearchController {
  element: HTMLElement;
  clear(): void;
}

export function createSearch(navs: NavController[]): SearchController {
  const input = h("input", {
    class: "search-input",
    type: "search",
    placeholder: "Search endpoints",
    autocomplete: "off",
    spellcheck: "false",
    "aria-label": "Search endpoints",
  });
  const count = h("span", { class: "search-count", "aria-live": "polite" });
  const element = h(
    "div",
    { class: "search", role: "search" },
    icon("search", "search-icon"),
    input,
    h("kbd", { class: "search-kbd" }, "/"),
    count,
  );

  const sections = Array.from(document.querySelectorAll<HTMLElement>(".endpoint[data-search]"));
  const groups = Array.from(document.querySelectorAll<HTMLElement>("[data-ep-group]"));

  const apply = (raw: string): void => {
    const query = raw.trim().toLowerCase();
    let matches = 0;
    for (const section of sections) {
      const hit = query.length === 0 || (section.dataset.search ?? "").includes(query);
      section.classList.toggle("is-filtered", !hit);
      if (hit && query.length > 0) matches += 1;
    }
    for (const group of groups) {
      const groupId = group.dataset.epGroup;
      const anyVisible = sections.some(
        (section) =>
          section.dataset.epGroupMember === groupId && !section.classList.contains("is-filtered"),
      );
      group.classList.toggle("is-filtered", !anyVisible);
    }
    for (const nav of navs) nav.filter(query);
    count.textContent = query.length === 0
      ? ""
      : matches === 0
        ? "No matches"
        : `${matches} ${matches === 1 ? "endpoint" : "endpoints"}`;
  };

  input.addEventListener("input", () => apply(input.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      input.value = "";
      apply("");
      input.blur();
      return;
    }
    if (event.key === "Enter") {
      const first = document.querySelector<HTMLElement>(".endpoint:not(.is-filtered)");
      first?.scrollIntoView({ block: "start" });
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const typing = target !== null && (
      target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.tagName === "SELECT" ||
      target.isContentEditable
    );
    if (typing) return;
    event.preventDefault();
    input.focus();
    input.select();
  });

  return {
    element,
    clear(): void {
      input.value = "";
      apply("");
    },
  };
}
