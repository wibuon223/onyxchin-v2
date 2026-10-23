/** Code panels: labelled blocks, tabs and collapsible responses. */

import { copyText } from "../lib/clipboard";
import { clear, h, icon } from "../lib/dom";
import { highlightJson, jsonText } from "../lib/highlight";
import type { EndpointSpec, ResponseSpec } from "../spec";

export interface CopyButtonOptions {
  label?: string;
  iconOnly?: boolean;
  className?: string;
}

export function createCopyButton(
  getText: () => string,
  options: CopyButtonOptions = {},
): HTMLButtonElement {
  const idleLabel = options.label ?? "Copy";
  const button = h("button", {
    class: ["copy-btn", options.className].filter(Boolean).join(" "),
    type: "button",
    "aria-label": `${idleLabel} to clipboard`,
    title: `${idleLabel} to clipboard`,
  });

  const paint = (done: boolean): void => {
    clear(button);
    button.appendChild(icon(done ? "check" : "copy"));
    if (!options.iconOnly) {
      button.appendChild(h("span", null, done ? "Copied" : idleLabel));
    }
    button.classList.toggle("is-done", done);
  };

  paint(false);
  let timer = 0;
  button.addEventListener("click", async (event) => {
    event.stopPropagation();
    const ok = await copyText(getText());
    if (!ok) return;
    paint(true);
    window.clearTimeout(timer);
    timer = window.setTimeout(() => paint(false), 1600);
  });
  return button;
}

export interface CodeTab {
  label: string;
  code: string;
}

export function createCodeTabs(tabs: CodeTab[]): HTMLElement {
  if (tabs.length === 0) return h("div");
  let active = 0;

  const tabRow = h("div", { class: "tabs", role: "tablist" });
  const pre = h("pre", { class: "codeblock-pre", tabindex: 0 });
  const code = h("code", null);
  pre.appendChild(code);

  const buttons = tabs.map((tab, index) => {
    const button = h("button", {
      class: "tab",
      type: "button",
      role: "tab",
      "aria-selected": String(index === 0),
    }, tab.label);
    button.addEventListener("click", () => select(index));
    tabRow.appendChild(button);
    return button;
  });

  const copy = createCopyButton(() => tabs[active].code);

  const select = (index: number): void => {
    active = index;
    buttons.forEach((button, i) => {
      const on = i === index;
      button.classList.toggle("is-active", on);
      button.setAttribute("aria-selected", String(on));
    });
    code.textContent = tabs[index].code;
  };

  select(0);

  return h(
    "div",
    { class: "codeblock codeblock-tabs" },
    h("div", { class: "codeblock-head" }, tabRow, copy),
    pre,
  );
}

export interface CodePanelOptions {
  label: string;
  meta?: string;
  text: string;
  language?: "json" | "text" | "http" | "m3u8" | "vtt";
  startOpen?: boolean;
  footnote?: string;
}

export function createCodePanel(options: CodePanelOptions): HTMLElement {
  const lineCount = options.text.split("\n").length;
  let open = options.startOpen ?? lineCount <= 18;

  const pre = h("pre", { class: "panel-pre", tabindex: 0 });
  if (options.language === "json") {
    highlightJson(pre, options.text);
  } else {
    pre.textContent = options.text;
  }

  const body = h("div", { class: "panel-body" }, pre);
  const toggle = h("button", { class: "panel-toggle", type: "button" });

  const apply = (): void => {
    body.classList.toggle("is-collapsed", !open);
    toggle.setAttribute("aria-expanded", String(open));
    clear(toggle);
    toggle.appendChild(icon(open ? "chevron-down" : "chevron-right"));
    toggle.appendChild(h("span", null, open ? "Collapse" : "Expand"));
  };

  toggle.addEventListener("click", () => {
    open = !open;
    apply();
  });
  apply();

  const head = h(
    "div",
    { class: "panel-head" },
    h(
      "div",
      { class: "panel-heading" },
      h("span", { class: "panel-label" }, options.label),
      options.meta ? h("span", { class: "panel-meta" }, options.meta) : null,
    ),
    h(
      "div",
      { class: "panel-actions" },
      toggle,
      createCopyButton(() => options.text),
    ),
  );

  return h(
    "div",
    { class: `panel panel-${options.language ?? "text"}` },
    head,
    body,
    options.footnote ? h("p", { class: "panel-footnote" }, options.footnote) : null,
  );
}

function contentTypeFor(response: ResponseSpec): string | undefined {
  switch (response.kind) {
    case "json":
      return "application/json";
    case "text":
      if (response.language === "m3u8") return "application/vnd.apple.mpegurl";
      if (response.language === "vtt") return "text/vtt; charset=utf-8";
      return "text/plain; charset=utf-8";
    case "headers":
      return response.binary === "image" ? "binary · image" : response.binary === "video" ? "binary · video" : undefined;
  }
}

export function createResponsePanel(ep: EndpointSpec): HTMLElement {
  const response = ep.response;
  if (response.kind === "json") {
    return createCodePanel({
      label: "Response · 200",
      meta: "application/json",
      text: jsonText(response.value),
      language: "json",
    });
  }

  if (response.kind === "text") {
    const label = response.language === "m3u8"
      ? "Response · 200 · rewritten playlist"
      : response.language === "vtt"
        ? "Response · 200 · WebVTT"
        : "Response · 200";
    return createCodePanel({
      label,
      meta: contentTypeFor(response),
      text: response.text,
      language: response.language,
    });
  }

  const raw = [
    response.statusLine,
    ...response.headers.map(([name, value]) => `${name}: ${value}`),
  ].join("\n");

  return createCodePanel({
    label: `Response · ${response.statusLine.replace(/^HTTP\/[\d.]+\s+/, "")}`,
    meta: contentTypeFor(response),
    text: raw,
    language: "http",
    footnote: response.summary,
  });
}
