import "./styles.css";
import { createNav } from "./components/nav";
import { renderEndpoint } from "./components/endpoint";
import {
  renderFooter,
  renderHero,
  renderNotes,
  renderOverview,
  renderSchemas,
  renderSources,
} from "./components/sections";
import { createSearch } from "./components/search";
import { createToc } from "./components/toc";
import { h, icon } from "./lib/dom";
import { createScrollSpy } from "./lib/spy";
import { ENDPOINTS, GROUP_LABEL, HERO, type GroupId } from "./spec";

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("Missing #app root element");

const GROUP_BLURB: Record<GroupId, string> = {
  discovery: "Service metadata and the adapter registry.",
  catalog: "Normalized reads across all five sources.",
  proxy: "Same-origin transport for images, media, playlists and subtitles.",
};

const GROUP_ORDER: GroupId[] = ["discovery", "catalog", "proxy"];

function groupHeader(id: GroupId): HTMLElement {
  return h(
    "div",
    { class: "ep-group", "data-ep-group": id },
    h("p", { class: "eyebrow" }, "Endpoints"),
    h("h2", { class: "ep-group-title" }, GROUP_LABEL[id]),
    h("p", { class: "ep-group-blurb" }, GROUP_BLURB[id]),
  );
}

const endpointBlocks: HTMLElement[] = [];
for (const groupId of GROUP_ORDER) {
  endpointBlocks.push(groupHeader(groupId));
  for (const endpoint of ENDPOINTS) {
    if (endpoint.group === groupId) endpointBlocks.push(renderEndpoint(endpoint));
  }
}

const main = h(
  "main",
  { class: "doc-main", id: "content", tabindex: "-1" },
  renderHero(),
  renderOverview(),
  ...endpointBlocks,
  renderSources(),
  renderSchemas(),
  renderNotes(),
  renderFooter(),
);

const toc = createToc(main);
const sidebar = createNav("sidebar");
const sheetNav = createNav("sheet");

const searchSlot = h("div", { class: "search-slot" });
const menuButton = h(
  "button",
  {
    class: "topbar-menu",
    type: "button",
    "aria-label": "Open documentation menu",
    "aria-expanded": "false",
    "aria-controls": "nav-sheet",
  },
  icon("menu"),
);

const topbar = h(
  "header",
  { class: "topbar" },
  h(
    "div",
    { class: "topbar-inner" },
    menuButton,
    h(
      "a",
      { class: "brand", href: "#overview", "aria-label": "OnyxChin API documentation" },
      h("span", { class: "brand-mark" }, "O"),
      h("span", { class: "brand-name" }, "OnyxChin"),
      h("span", { class: "brand-tag" }, "API"),
    ),
    searchSlot,
    h("div", { class: "topbar-right" }, h("span", { class: "version-chip" }, HERO.version)),
  ),
);

const layout = h(
  "div",
  { class: "layout" },
  h("aside", { class: "nav-col" }, sidebar.element),
  main,
  h("aside", { class: "toc-col" }, toc.element),
);

const sheetClose = h(
  "button",
  { class: "sheet-close", type: "button", "aria-label": "Close documentation menu" },
  icon("close"),
);

const sheet = h(
  "div",
  { class: "sheet", id: "nav-sheet", hidden: true },
  h(
    "div",
    { class: "sheet-head" },
    h("span", { class: "sheet-title" }, "Documentation"),
    sheetClose,
  ),
  sheetNav.element,
);

root.append(
  h("a", { class: "skip-link", href: "#content" }, "Skip to content"),
  topbar,
  layout,
  sheet,
);

const search = createSearch([sidebar, sheetNav]);
searchSlot.appendChild(search.element);

let sheetOpen = false;
const setSheet = (open: boolean, restoreFocus = true): void => {
  if (open === sheetOpen) return;
  sheetOpen = open;
  sheet.hidden = !open;
  menuButton.setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("sheet-open", open);
  if (open) {
    sheetClose.focus();
  } else if (restoreFocus) {
    menuButton.focus();
  }
};

menuButton.addEventListener("click", () => setSheet(!sheetOpen));
sheetClose.addEventListener("click", () => setSheet(false));
sheet.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (!target?.closest("a")) return;
  setSheet(false, false);
  window.setTimeout(() => main.focus({ preventScroll: true }), 0);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheetOpen) setSheet(false);
});
window.addEventListener("resize", () => {
  if (sheetOpen && window.innerWidth > 1080) setSheet(false, false);
});

const spyIds = Array.from(document.querySelectorAll<HTMLElement>("[data-spy-id]")).map(
  (section) => section.dataset.spyId ?? section.id,
);

const initialActive = spyIds[0] ?? "overview";
sidebar.setActive(initialActive);
sheetNav.setActive(initialActive);

createScrollSpy(spyIds, (id) => {
  sidebar.setActive(id);
  sheetNav.setActive(id);
  toc.setActive(id);
});
