/** Page sections that are not endpoint blocks. */

import { createCodePanel, createCopyButton } from "./code";
import { h, icon, rich } from "../lib/dom";
import {
  API_BASE,
  ERROR_ROWS,
  ENVELOPE_ROWS,
  HERO,
  NOTES,
  QUICK_FACTS,
  SCHEMAS,
  SOURCE_MATRIX,
  SOURCES,
  type SchemaSpec,
} from "../spec";

function sectionHeader(eyebrow: string, title: string): HTMLElement {
  return h(
    "header",
    { class: "section-head" },
    h("p", { class: "eyebrow" }, eyebrow),
    h("h2", { class: "section-title" }, title),
  );
}

export function renderHero(): HTMLElement {
  const facts = h("dl", { class: "facts" });
  for (const fact of QUICK_FACTS) {
    facts.appendChild(
      h(
        "div",
        { class: "fact" },
        h("dt", null, fact.label),
        h(
          "dd",
          { class: fact.mono ? "fact-value is-mono" : "fact-value" },
          fact.value,
          fact.mono
            ? createCopyButton(() => API_BASE, { iconOnly: true, label: "Copy base URL", className: "fact-copy" })
            : null,
        ),
      ),
    );
  }

  return h(
    "header",
    { class: "hero" },
    h("p", { class: "eyebrow" }, `${HERO.eyebrow} · ${HERO.version}`),
    h("h1", { class: "hero-title" }, "OnyxChin ", h("span", { class: "hero-accent" }, "API")),
    h("p", { class: "lede" }, HERO.lede),
    facts,
  );
}

export function renderOverview(): HTMLElement {
  const envelopeTable = h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "matrix" },
      h("thead", null, h("tr", null, h("th", null, "Shape"), h("th", null, "Routes"))),
      h(
        "tbody",
        null,
        ...ENVELOPE_ROWS.map((row) =>
          h("tr", null, h("td", null, h("code", null, row.shape)), h("td", null, h("code", { class: "dim-code" }, row.routes))),
        ),
      ),
    ),
  );

  const errorTable = h(
    "div",
    { class: "table-wrap" },
    h(
      "table",
      { class: "matrix" },
      h(
        "thead",
        null,
        h("tr", null, h("th", null, "Status"), h("th", null, "Body"), h("th", null, "Meaning")),
      ),
      h(
        "tbody",
        null,
        ...ERROR_ROWS.map((row) =>
          h(
            "tr",
            null,
            h("td", null, h("span", { class: "error-code" }, row.status)),
            h("td", null, h("code", null, row.body)),
            h("td", null, rich(row.meaning)),
          ),
        ),
      ),
    ),
  );

  return h(
    "section",
    {
      class: "doc-section",
      id: "overview",
      "data-spy-id": "overview",
      "data-nav-label": "Overview",
    },
    sectionHeader("Getting started", "Overview"),
    h(
      "p",
      { class: "prose" },
      rich(
        "Every catalog route is `GET /api/:source/…` and answers with a single `data` key. Discovery routes (`/api/health`, `/api/sources`) and the proxy routes are the documented exceptions.",
      ),
    ),
    h(
      "p",
      { class: "prose" },
      rich(
        "Five adapters normalize five different upstream sites into the same `Card`, `Anime`, `Episode`, `VideoSource` and `SubtitleTrack` shapes, so one renderer can consume every source.",
      ),
    ),
    h("h3", { class: "subhead", id: "overview-envelope", "data-sub": "Response envelope" }, "Response envelope"),
    envelopeTable,
    h("h3", { class: "subhead", id: "overview-errors", "data-sub": "Errors" }, "Errors"),
    h(
      "p",
      { class: "prose" },
      rich("Non-2xx responses always carry a single `error` string. They are never HTML error pages."),
    ),
    errorTable,
  );
}

export function renderSources(): HTMLElement {
  const rows = SOURCE_MATRIX.map((source) =>
    h(
      "tr",
      null,
      h(
        "td",
        null,
        h("code", { class: "source-id" }, source.id),
        h("span", { class: "source-name" }, source.name),
      ),
      h("td", null, source.catalog),
      h("td", null, source.playback),
      h("td", { class: "muted" }, source.extras),
    ),
  );

  return h(
    "section",
    {
      class: "doc-section",
      id: "sources",
      "data-spy-id": "sources",
      "data-nav-label": "Sources",
    },
    sectionHeader("Reference", "Sources"),
    h(
      "p",
      { class: "prose" },
      rich(
        "The `:source` path segment takes one of five ids. Catalog size and playback capabilities differ per upstream — resolve `VideoSource.kind` rather than assuming MP4 everywhere.",
      ),
    ),
    h(
      "div",
      { class: "table-wrap" },
      h(
        "table",
        { class: "matrix sources-matrix" },
        h(
          "thead",
          null,
          h(
            "tr",
            null,
            h("th", null, "Source"),
            h("th", null, "Catalog"),
            h("th", null, "Playback"),
            h("th", null, "Notes"),
          ),
        ),
        h("tbody", null, ...rows),
      ),
    ),
    h(
      "div",
      { class: "source-chips" },
      ...SOURCES.map((source) => h("code", { class: "source-chip" }, `${source.id} · ${source.lang}`)),
    ),
  );
}

function schemaCard(schema: SchemaSpec): HTMLElement {
  const fields = schema.fields
    ? h(
        "div",
        { class: "table-wrap" },
        h(
          "table",
          { class: "matrix fields-table" },
          h(
            "thead",
            null,
            h("tr", null, h("th", null, "Field"), h("th", null, "Type"), h("th", null, "Required"), h("th", null, "Notes")),
          ),
          h(
            "tbody",
            null,
            ...schema.fields.map((field) =>
              h(
                "tr",
                null,
                h("td", null, h("code", null, field.name)),
                h("td", null, h("code", { class: "dim-code" }, field.type)),
                h(
                  "td",
                  null,
                  field.required
                    ? h("span", { class: "param-flag is-required" }, "required")
                    : h("span", { class: "param-flag" }, "optional"),
                ),
                h("td", null, rich(field.desc)),
              ),
            ),
          ),
        ),
      )
    : null;

  const notes = schema.notes
    ? h("ul", { class: "ep-notes" }, ...schema.notes.map((note) => h("li", null, rich(note))))
    : null;

  return h(
    "article",
    { class: "schema-card", id: `schema-${schema.id}` },
    h(
      "header",
      { class: "schema-head" },
      h("h3", { id: `schema-${schema.id}-title`, "data-sub": schema.name }, schema.name),
      h("p", null, schema.summary),
    ),
    fields,
    notes,
    createCodePanel({
      label: "TypeScript",
      text: schema.code,
      language: "text",
    }),
  );
}

export function renderSchemas(): HTMLElement {
  return h(
    "section",
    {
      class: "doc-section",
      id: "schemas",
      "data-spy-id": "schemas",
      "data-nav-label": "Type reference",
    },
    sectionHeader("Reference", "Type reference"),
    h(
      "p",
      { class: "prose" },
      rich(
        "Field-level contract for every payload. Optional fields are omitted, never `null`, unless the type says `| null`.",
      ),
    ),
    ...SCHEMAS.map(schemaCard),
  );
}

export function renderNotes(): HTMLElement {
  return h(
    "section",
    {
      class: "doc-section",
      id: "notes",
      "data-spy-id": "notes",
      "data-nav-label": "Notes",
    },
    sectionHeader("Reference", "Operational notes"),
    h(
      "ol",
      { class: "notes-list" },
      ...NOTES.map((note, index) =>
        h(
          "li",
          null,
          h("span", { class: "note-index" }, String(index + 1).padStart(2, "0")),
          h(
            "div",
            null,
            h("h3", { class: "note-title" }, note.title),
            h("p", { class: "note-body" }, rich(note.body)),
          ),
        ),
      ),
    ),
  );
}

export function renderFooter(): HTMLElement {
  return h(
    "footer",
    { class: "footer" },
    h("span", { class: "footer-brand" }, HERO.title, " · ", HERO.version),
    h(
      "span",
      { class: "footer-meta" },
      h("code", null, API_BASE.replace(/^https?:\/\//, "")),
      " · GET only · no auth",
    ),
    h(
      "a",
      { class: "footer-link", href: "#overview", "aria-label": "Back to top" },
      "Top",
      icon("arrow-up-right"),
    ),
  );
}
