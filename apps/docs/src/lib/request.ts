/** URL construction + request samples derived from a single endpoint spec. */

import { type EndpointSpec } from "../spec";

export type ParamValues = Record<string, string>;

export function defaultValues(ep: EndpointSpec): ParamValues {
  const values: ParamValues = {};
  for (const param of ep.params) values[param.name] = param.example;
  return values;
}

/** Relative request target; unresolved required path params keep their `:name`. */
export function buildPath(ep: EndpointSpec, values: ParamValues): string {
  const path = ep.path.replace(/:([A-Za-z0-9_]+)/g, (match, name: string) => {
    const value = (values[name] ?? "").trim();
    return value ? encodeURIComponent(value) : match;
  });
  const query: string[] = [];
  for (const param of ep.params) {
    if (param.in !== "query") continue;
    const value = (values[param.name] ?? "").trim();
    if (!value) continue;
    query.push(`${encodeURIComponent(param.name)}=${encodeURIComponent(value)}`);
  }
  return query.length ? `${path}?${query.join("&")}` : path;
}

export function missingRequired(ep: EndpointSpec, values: ParamValues): string[] {
  return ep.params
    .filter((param) => param.required && !(values[param.name] ?? "").trim())
    .map((param) => param.name);
}

export function curlExample(ep: EndpointSpec, url: string): string {
  if (ep.id === "img") return `curl -sS "${url}" -o poster.jpg`;
  if (ep.id === "media") {
    return `curl -sS -H "Range: bytes=0-1048575" "${url}" -o episode.part.mp4`;
  }
  return `curl -sS "${url}"`;
}

export function fetchExample(ep: EndpointSpec, url: string): string {
  switch (ep.id) {
    case "img":
      return [
        `const res = await fetch("${url}");`,
        "const blob = await res.blob();",
        'document.querySelector("img").src = URL.createObjectURL(blob);',
      ].join("\n");
    case "media":
      return [
        `const res = await fetch("${url}", {`,
        '  headers: { Range: "bytes=0-1048575" },',
        "});",
        'console.log(res.status, res.headers.get("content-range"));',
      ].join("\n");
    case "hls":
    case "sub":
      return [
        `const res = await fetch("${url}");`,
        "const text = await res.text();",
        "console.log(text.slice(0, 400));",
      ].join("\n");
    case "health":
      return [
        `const res = await fetch("${url}");`,
        "const health = await res.json();",
        "console.log(health.ok, health.sources);",
      ].join("\n");
    default:
      return [
        `const res = await fetch("${url}");`,
        "const { data } = await res.json();",
        "console.log(data);",
      ].join("\n");
  }
}
