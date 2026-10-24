import type { Context } from "hono";
import { createHash } from "node:crypto";

/**
 * JSON response with real HTTP caching: browsers keep it briefly, any shared
 * cache keeps it for the server TTL, and a matching ETag turns repeat requests
 * into cheap 304s even when the entry is still being refreshed upstream.
 */
export function jsonCached(
  c: Context,
  payload: unknown,
  opts: { maxAge: number; sMaxAge: number; swr: number }
) {
  const body = JSON.stringify(payload);
  const etag = `W/"${createHash("sha1").update(body).digest("base64url").slice(0, 16)}"`;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    // s-maxage=0 keeps Cloudflare from pinning stale JSON at the edge: our own
    // in-memory SWR cache already absorbs the load, and browsers still keep the
    // payload for `maxAge`. Revalidation goes through the ETag (304, no body).
    "cache-control": `public, max-age=${opts.maxAge}, s-maxage=0, must-revalidate`,
    etag,
    "access-control-allow-origin": "*",
  };
  const inm = c.req.header("if-none-match");
  if (inm && inm.split(",").some((tag) => tag.trim() === etag)) {
    return c.body(null, 304, headers);
  }
  return c.body(body, 200, headers);
}

/** Signed media URLs must never be cached by a shared cache. */
export function jsonNoStore(c: Context, payload: unknown) {
  return c.body(JSON.stringify(payload), 200, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
}
