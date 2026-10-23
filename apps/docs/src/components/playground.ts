/** Live playground: builds a URL from the spec, calls the API, renders the result. */

import { createCodePanel, createCopyButton } from "./code";
import { clear, formatBytes, h, methodPill, rich } from "../lib/dom";
import { jsonText } from "../lib/highlight";
import { buildPath, defaultValues, missingRequired } from "../lib/request";
import { API_BASE, type EndpointSpec, type ParamSpec } from "../spec";

const REQUEST_TIMEOUT_MS = 60_000;

export function createPlayground(ep: EndpointSpec): HTMLElement {
  const values = defaultValues(ep);
  const controls = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const state: { controller: AbortController | null; objectUrl: string | null } = {
    controller: null,
    objectUrl: null,
  };

  const urlCode = h("code", { class: "pg-url" });
  const sendButton = h("button", { class: "pg-send", type: "button" }, "Send");
  const stopButton = h("button", { class: "pg-stop", type: "button", hidden: true }, "Stop");
  const result = h("div", { class: "pg-result", hidden: true, "aria-live": "polite" });

  const fields = h("div", { class: "pg-fields" });
  if (ep.params.length === 0) {
    fields.appendChild(h("p", { class: "pg-none" }, "No parameters — send the request as-is."));
  }

  const sync = (): void => {
    for (const [name, control] of controls) values[name] = control.value;
    urlCode.textContent = buildPath(ep, values);
    const missing = missingRequired(ep, values);
    sendButton.disabled = missing.length > 0 || state.controller !== null;
    sendButton.title = missing.length ? `Fill required: ${missing.join(", ")}` : "";
  };

  const addField = (param: ParamSpec): void => {
    let control: HTMLInputElement | HTMLSelectElement;
    if (param.values) {
      const select = h("select", { class: "pg-input", "aria-label": param.name });
      for (const value of param.values) select.appendChild(h("option", { value }, value));
      select.value = values[param.name] ?? param.example;
      control = select;
    } else {
      control = h("input", {
        class: "pg-input",
        type: "text",
        value: values[param.name] ?? "",
        placeholder: param.placeholder ?? param.example,
        spellcheck: "false",
        autocomplete: "off",
        "aria-label": param.name,
      });
    }
    controls.set(param.name, control);
    control.addEventListener("input", sync);
    control.addEventListener("change", sync);

    fields.appendChild(
      h(
        "label",
        { class: "pg-field" },
        h(
          "span",
          { class: "pg-field-top" },
          h("code", { class: "pg-field-name" }, param.name),
          h("span", { class: `pg-loc pg-loc-${param.in}` }, param.in),
          param.required ? h("span", { class: "pg-req" }, "required") : null,
        ),
        control,
      ),
    );
  };

  for (const param of ep.params) addField(param);
  sync();

  const metrics = (
    status: number,
    statusText: string,
    ms: number,
    contentType: string,
    bytes?: number,
  ): HTMLElement => {
    const tone = status >= 200 && status < 300 ? "is-ok" : status >= 400 && status < 500 ? "is-warn" : "is-error";
    const row = h("div", { class: "pg-metrics" });
    row.appendChild(
      h(
        "span",
        { class: `status-chip ${tone}` },
        h("span", { class: "status-dot" }),
        `${status} ${statusText}`.trim(),
      ),
    );
    row.appendChild(h("span", { class: "pg-metric" }, `${ms} ms`));
    if (contentType) row.appendChild(h("span", { class: "pg-metric" }, contentType.split(";")[0]));
    if (bytes !== undefined) row.appendChild(h("span", { class: "pg-metric" }, formatBytes(bytes)));
    return row;
  };

  const showNotice = (title: string, body: string, url: string): void => {
    clear(result);
    result.hidden = false;
    result.appendChild(
      h(
        "div",
        { class: "pg-notice" },
        h("p", { class: "pg-notice-title" }, title),
        h("p", null, body),
        h("p", { class: "pg-request-line" }, methodPill("GET"), h("code", null, url)),
      ),
    );
  };

  const renderJson = (text: string, meta: HTMLElement): void => {
    let parsed: unknown;
    let valid = true;
    try {
      parsed = JSON.parse(text);
    } catch {
      valid = false;
    }
    meta.appendChild(h("span", { class: "pg-metric" }, formatBytes(new TextEncoder().encode(text).length)));
    result.appendChild(meta);
    if (!valid) {
      result.appendChild(
        createCodePanel({
          label: "Response body",
          meta: "unparsable JSON",
          text: text.slice(0, 20_000),
          language: "text",
          startOpen: true,
        }),
      );
      return;
    }
    const full = jsonText(parsed);
    const clipped = full.length > 240_000;
    result.appendChild(
      createCodePanel({
        label: "Response body",
        meta: clipped ? "truncated" : undefined,
        text: clipped ? `${full.slice(0, 240_000)}\n\n… truncated` : full,
        language: "json",
        startOpen: true,
      }),
    );
  };

  const renderImage = async (res: Response, meta: HTMLElement): Promise<void> => {
    const blob = await res.blob();
    meta.appendChild(h("span", { class: "pg-metric" }, formatBytes(blob.size)));
    result.appendChild(meta);
    if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = URL.createObjectURL(blob);
    result.appendChild(
      h("img", {
        class: "pg-image",
        src: state.objectUrl,
        alt: "Proxy response preview",
      }),
    );
  };

  const renderText = async (res: Response, contentType: string, meta: HTMLElement): Promise<void> => {
    const text = await res.text();
    meta.appendChild(h("span", { class: "pg-metric" }, formatBytes(new TextEncoder().encode(text).length)));
    result.appendChild(meta);
    const language = /mpegurl/i.test(contentType) ? "m3u8" : /vtt/i.test(contentType) ? "vtt" : "text";
    const clipped = text.length > 120_000;
    result.appendChild(
      createCodePanel({
        label: "Response body",
        meta: clipped ? "truncated" : undefined,
        text: clipped ? `${text.slice(0, 120_000)}\n… truncated` : text,
        language,
        startOpen: true,
      }),
    );
  };

  const renderResponse = async (res: Response, ms: number): Promise<void> => {
    clear(result);
    result.hidden = false;
    const contentType = res.headers.get("content-type") ?? "";
    const meta = metrics(res.status, res.statusText, ms, contentType);

    if (/json/i.test(contentType)) {
      renderJson(await res.text(), meta);
      return;
    }
    if (contentType.startsWith("image/")) {
      await renderImage(res, meta);
      return;
    }
    if (contentType.startsWith("text/") || /mpegurl|vtt/i.test(contentType)) {
      await renderText(res, contentType, meta);
      return;
    }

    const buffer = await res.arrayBuffer();
    meta.appendChild(h("span", { class: "pg-metric" }, formatBytes(buffer.byteLength)));
    result.appendChild(meta);
    result.appendChild(
      h(
        "p",
        { class: "pg-none" },
        `Binary response (${contentType || "unknown type"}). Inspect it with the curl example.`,
      ),
    );
  };

  const send = async (): Promise<void> => {
    if (state.controller) return;
    const controller = new AbortController();
    state.controller = controller;
    let timedOut = false;
    sync();
    sendButton.disabled = true;
    sendButton.textContent = "Sending";
    stopButton.hidden = false;

    const url = API_BASE + buildPath(ep, values);
    const started = performance.now();
    const timer = window.setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(url, { signal: controller.signal, headers: { accept: "*/*" } });
      await renderResponse(res, Math.round(performance.now() - started));
    } catch (error) {
      const ms = Math.round(performance.now() - started);
      if (timedOut) {
        showNotice(
          "Request timed out",
          `No response after ${Math.round(ms / 1000)} seconds. The free plan can cold-start for ~30 s; retry once before assuming the endpoint is down.`,
          url,
        );
      } else if (controller.signal.aborted) {
        showNotice("Request cancelled", "You stopped the request before it completed.", url);
      } else {
        clear(result);
        result.hidden = false;
        result.appendChild(
          h(
            "div",
            { class: "pg-error" },
            h("p", { class: "pg-error-title" }, "The request failed before a response was readable"),
            h("p", { class: "pg-error-message" }, error instanceof Error ? error.message : String(error)),
            h(
              "p",
              { class: "pg-error-hint" },
              rich(
                "A browser-level failure is network, DNS, or a response missing `Access-Control-Allow-Origin`. This API sends `*` when the route is live — if it persists, the service may be asleep or not deployed. Retry once, then check `GET /api/health` in a new tab.",
              ),
            ),
            h("p", { class: "pg-request-line" }, methodPill("GET"), h("code", null, url)),
          ),
        );
      }
    } finally {
      window.clearTimeout(timer);
      state.controller = null;
      stopButton.hidden = true;
      sendButton.textContent = "Send";
      sync();
    }
  };

  sendButton.addEventListener("click", () => void send());
  stopButton.addEventListener("click", () => state.controller?.abort());

  return h(
    "div",
    { class: "playground" },
    h(
      "div",
      { class: "pg-head" },
      h("span", { class: "pg-title" }, "Try it"),
      h("span", { class: "pg-sub" }, "Runs from your browser against the live API."),
    ),
    fields,
    h(
      "div",
      { class: "pg-request" },
      methodPill("GET"),
      urlCode,
      createCopyButton(() => API_BASE + buildPath(ep, values), {
        iconOnly: true,
        label: "Copy request URL",
        className: "pg-copy-url",
      }),
    ),
    h(
      "div",
      { class: "pg-actions" },
      sendButton,
      stopButton,
      h("span", { class: "pg-hint" }, `Base ${API_BASE.replace(/^https?:\/\//, "")}`),
    ),
    result,
  );
}
