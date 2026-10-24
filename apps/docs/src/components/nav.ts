/** Left navigation: grouped links plus filter + active state. */

import { h } from "../lib/dom";
import { ENDPOINTS, GROUP_LABEL, type GroupId } from "../spec";

export interface NavItem {
  id: string;
  title: string;
  kind: "endpoint" | "section";
  method?: string;
  search: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

function endpointGroup(id: GroupId): NavGroup {
  return {
    label: GROUP_LABEL[id],
    items: ENDPOINTS.filter((endpoint) => endpoint.group === id).map((endpoint) => ({
      id: `ep-${endpoint.id}`,
      title: endpoint.title,
      kind: "endpoint" as const,
      method: endpoint.method,
      search: `${endpoint.title} ${endpoint.path} ${endpoint.summary}`.toLowerCase(),
    })),
  };
}

function buildNavGroups(): NavGroup[] {
  return [
    {
      label: "Getting started",
      items: [{ id: "overview", title: "Overview", kind: "section", search: "overview" }],
    },
    endpointGroup("discovery"),
    endpointGroup("catalog"),
    endpointGroup("proxy"),
    endpointGroup("sync"),
    {
      label: "Reference",
      items: [
        { id: "sources", title: "Sources", kind: "section", search: "sources matrix" },
        { id: "schemas", title: "Type reference", kind: "section", search: "types schemas" },
        { id: "notes", title: "Notes", kind: "section", search: "operational notes" },
      ],
    },
  ];
}

export interface NavController {
  element: HTMLElement;
  setActive(id: string): void;
  filter(query: string): void;
}

export function createNav(variant: "sidebar" | "sheet"): NavController {
  const links = new Map<string, HTMLAnchorElement>();
  const endpointGroups: { element: HTMLElement; items: NavItem[] }[] = [];

  const nav = h("nav", {
    class: `nav nav-${variant}`,
    "aria-label": variant === "sheet" ? "Documentation, compact" : "Documentation",
  });

  for (const group of buildNavGroups()) {
    const list = h("div", { class: "nav-list" });
    for (const item of group.items) {
      const link = h(
        "a",
        {
          class: `nav-link nav-${item.kind}`,
          href: `#${item.id}`,
          "data-id": item.id,
          "data-search": item.search,
        },
        item.method ? h("span", { class: "nav-method" }, item.method) : null,
        h("span", { class: "nav-title" }, item.title),
      );
      links.set(item.id, link);
      list.appendChild(link);
    }
    const groupEl = h(
      "div",
      { class: "nav-group" },
      h("p", { class: "nav-label" }, group.label),
      list,
    );
    nav.appendChild(groupEl);
    if (group.items.some((item) => item.kind === "endpoint")) {
      endpointGroups.push({ element: groupEl, items: group.items });
    }
  }

  return {
    element: nav,
    setActive(id: string): void {
      for (const [key, link] of links) {
        const on = key === id;
        link.classList.toggle("is-active", on);
        if (on) link.setAttribute("aria-current", "true");
        else link.removeAttribute("aria-current");
      }
    },
    filter(query: string): void {
      const needle = query.trim().toLowerCase();
      for (const link of links.values()) {
        if (!link.classList.contains("nav-endpoint")) continue;
        const hit = needle.length === 0 || (link.dataset.search ?? "").includes(needle);
        link.classList.toggle("is-hidden", !hit);
      }
      for (const group of endpointGroups) {
        const anyVisible = group.items.some((item) => !links.get(item.id)?.classList.contains("is-hidden"));
        group.element.classList.toggle("is-hidden", !anyVisible);
      }
    },
  };
}
