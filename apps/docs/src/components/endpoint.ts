/** One endpoint block: header, params, request samples, response, playground. */

import { createCodeTabs, createCopyButton, createResponsePanel } from "./code";
import { createPlayground } from "./playground";
import { h, methodPill, rich } from "../lib/dom";
import { buildPath, curlExample, defaultValues, fetchExample } from "../lib/request";
import { API_BASE, type EndpointSpec, type ParamSpec } from "../spec";

function paramsTable(params: ParamSpec[]): HTMLElement {
  if (params.length === 0) {
    return h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "params" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Name"),
            h("th", null, "In"),
            h("th", null, "Type"),
            h("th", null, "Required"),
            h("th", null, "Description"),
          ),
        ),
        h(
          "tbody",
          null,
          h(
            "tr",
            null,
            h("td", { class: "params-empty", colspan: "5" }, "No parameters. Send the request as-is."),
          ),
        ),
      ),
    );
  }

  const rows = params.map((param) =>
    h(
      "tr",
      null,
      h("td", { class: "col-name" }, h("code", { class: "param-name" }, param.name)),
      h("td", null, h("span", { class: `param-in param-in-${param.in}` }, param.in)),
      h("td", null, h("code", { class: "param-type" }, param.type)),
      h(
        "td",
        null,
        param.required
          ? h("span", { class: "param-flag is-required" }, "required")
          : h("span", { class: "param-flag" }, "optional"),
      ),
      h(
        "td",
        null,
        rich(param.desc),
        param.values
          ? h("p", { class: "param-values" }, param.values.join(" · "))
          : null,
      ),
    ),
  );

  return h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "params" },
      h(
        "thead",
        null,
        h(
          "tr",
          null,
          h("th", null, "Name"),
          h("th", null, "In"),
          h("th", null, "Type"),
          h("th", null, "Required"),
          h("th", null, "Description"),
        ),
      ),
      h("tbody", null, ...rows),
    ),
  );
}

function errorsList(ep: EndpointSpec): HTMLElement | null {
  if (!ep.errors || ep.errors.length === 0) return null;
  return h(
    "dl",
    { class: "errors" },
    ...ep.errors.map((entry) =>
      h(
        "div",
        { class: "error-row" },
        h("dt", null, h("span", { class: "error-code" }, entry.status)),
        h("dd", null, rich(entry.meaning)),
      ),
    ),
  );
}

function notesList(ep: EndpointSpec): HTMLElement | null {
  if (!ep.notes || ep.notes.length === 0) return null;
  return h(
    "ul",
    { class: "ep-notes" },
    ...ep.notes.map((note) => h("li", null, rich(note))),
  );
}

export function renderEndpoint(ep: EndpointSpec): HTMLElement {
  const sectionId = `ep-${ep.id}`;
  const values = defaultValues(ep);
  const url = API_BASE + buildPath(ep, values);

  const sub = (suffix: string): string => `${sectionId}-${suffix}`;

  const section = h("section", {
    class: "endpoint",
    id: sectionId,
    "data-spy-id": sectionId,
    "data-nav-label": ep.title,
    "data-search": `${ep.title} ${ep.path} ${ep.summary}`.toLowerCase(),
    "data-ep-group-member": ep.group,
  });

  section.appendChild(
    h(
      "div",
      { class: "ep-head" },
      methodPill(ep.method),
      h("code", { class: "ep-path" }, ep.path),
      createCopyButton(() => ep.path, { label: "Copy path", className: "ep-copy" }),
    ),
  );

  section.appendChild(h("h3", { class: "ep-title" }, ep.title));
  section.appendChild(h("p", { class: "ep-desc" }, rich(ep.description)));

  section.appendChild(h("h4", { class: "subhead", id: sub("params"), "data-sub": "Parameters" }, "Parameters"));
  section.appendChild(paramsTable(ep.params));

  section.appendChild(h("h4", { class: "subhead", id: sub("example"), "data-sub": "Example request" }, "Example request"));
  section.appendChild(
    createCodeTabs([
      { label: "curl", code: curlExample(ep, url) },
      { label: "JavaScript", code: fetchExample(ep, url) },
    ]),
  );

  section.appendChild(h("h4", { class: "subhead", id: sub("response"), "data-sub": "Response" }, "Response"));
  section.appendChild(createResponsePanel(ep));

  const errors = errorsList(ep);
  if (errors) {
    section.appendChild(h("h4", { class: "subhead", id: sub("errors"), "data-sub": "Errors" }, "Errors"));
    section.appendChild(errors);
  }

  const notes = notesList(ep);
  if (notes) {
    section.appendChild(
      h("h4", { class: "subhead subhead-quiet", id: sub("notes"), "data-sub": "Notes" }, "Notes"),
    );
    section.appendChild(notes);
  }

  section.appendChild(h("h4", { class: "subhead", id: sub("try"), "data-sub": "Try it" }, "Try it"));
  section.appendChild(createPlayground(ep));

  return section;
}
