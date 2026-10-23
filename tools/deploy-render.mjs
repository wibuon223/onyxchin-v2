#!/usr/bin/env node
/**
 * Deploy OnyxChin to Render via REST API.
 *
 *   RENDER_API_KEY=rnd_xxx node tools/deploy-render.mjs
 *
 * Creates (or updates) three services in the workspace:
 *   onyxchin-api   web service  (node)
 *   onyxchin-web   static site  (apps/web/dist)
 *   onyxchin-docs  static site  (apps/docs/dist)
 */
import { execFileSync } from "node:child_process";

const KEY = process.env.RENDER_API_KEY;
if (!KEY) {
  console.error("RENDER_API_KEY missing");
  process.exit(1);
}

const API = "https://api.render.com/v1";
const OWNER_ID = process.env.RENDER_OWNER_ID ?? "tea-db808lgn74is73d9i8f0";
const REPO = process.env.ONYX_REPO ?? "https://github.com/wibuon223/onyxchin-v2";
const BRANCH = process.env.ONYX_BRANCH ?? "main";
const API_BASE = "https://onyxchin-api.onrender.com";

const services = [
  {
    name: "onyxchin-api",
    type: "web_service",
    serviceDetails: {
      env: "node",
      plan: "free",
      region: "singapore",
      healthCheckPath: "/api/health",
      envSpecificDetails: {
        buildCommand: "npm ci --include=dev && npm run build:shared && npm run build:api",
        startCommand: "npm run start:api",
      },
      envVars: [
        { key: "NODE_VERSION", value: "22" },
        { key: "NODE_ENV", value: "production" },
      ],
    },
  },
  {
    name: "onyxchin-web",
    type: "static_site",
    serviceDetails: {
      buildCommand: "npm ci --include=dev && npm run build:shared && npm run build:web",
      publishPath: "apps/web/dist",
      pullRequestPreviewsEnabled: "no",
      envVars: [{ key: "VITE_API_BASE", value: API_BASE }],
    },
  },
  {
    name: "onyxchin-docs",
    type: "static_site",
    serviceDetails: {
      buildCommand: "npm ci --include=dev && npm run build:shared && npm run build:docs",
      publishPath: "apps/docs/dist",
      pullRequestPreviewsEnabled: "no",
      envVars: [{ key: "VITE_API_BASE", value: API_BASE }],
    },
  },
];

async function call(method, path, body) {
  const res = await fetch(API + path, {
    method,
    headers: {
      authorization: `Bearer ${KEY}`,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  if (!res.ok) {
    const err = new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function existing() {
  const list = await call("GET", "/services?limit=100");
  const map = new Map();
  for (const row of list ?? []) {
    const s = row.service ?? row;
    map.set(s.name, s);
  }
  return map;
}

async function createSvc(spec) {
  const body = {
    type: spec.type,
    name: spec.name,
    ownerId: OWNER_ID,
    repo: REPO,
    branch: BRANCH,
    autoDeploy: "yes",
    serviceDetails: spec.serviceDetails,
  };
  return call("POST", "/services", body);
}

async function ensureSpaRewrite(svcId) {
  try {
    await call("POST", `/services/${svcId}/routes`, {
      type: "rewrite",
      source: "/:path*",
      destination: "/index.html",
    });
    return "rewrite added";
  } catch (e) {
    return `rewrite skipped (${e.status ?? "?"})`;
  }
}

async function triggerDeploy(svcId) {
  try {
    const d = await call("POST", `/services/${svcId}/deploys`, { clearCache: "do_not_clear" });
    return d?.id ?? "queued";
  } catch (e) {
    return `deploy error ${e.status ?? ""}`;
  }
}

const have = await existing();
const out = {};

for (const spec of services) {
  const found = have.get(spec.name);
  if (found) {
    try {
      await call("PATCH", `/services/${found.id}`, {
        serviceDetails: spec.serviceDetails,
        repo: REPO,
        branch: BRANCH,
        autoDeploy: "yes",
      });
    } catch (e) {
      console.warn(`patch ${spec.name} failed: ${e.message}`);
    }
    out[spec.name] = { id: found.id, action: "updated", url: found.serviceDetails?.url ?? found.url };
  } else {
    const created = await createSvc(spec);
    const s = created.service ?? created;
    out[spec.name] = { id: s.id, action: "created", url: s.serviceDetails?.url ?? s.url };
    if (spec.type === "static_site") {
      out[spec.name].rewrite = await ensureSpaRewrite(s.id);
    }
  }
}

for (const [name, info] of Object.entries(out)) {
  if (info.id) info.deploy = await triggerDeploy(info.id);
}

console.log(JSON.stringify(out, null, 2));
