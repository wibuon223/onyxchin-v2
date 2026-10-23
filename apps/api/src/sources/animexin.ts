import type { SourceAdapter } from "@onyxchin/shared";

// TODO(agent): implement against live site.
export const animexin: SourceAdapter = {
  id: "animexin",
  name: "AnimeXin",
  baseUrl: "https://animexin.dev",
  lang: "id",
  async home() {
    return { hero: [], sections: [] };
  },
  async list() {
    return { items: [], page: 1, hasNext: false };
  },
  async search() {
    return [];
  },
  async detail(slug) {
    throw new Error("not implemented: detail " + slug);
  },
  async watch(slug, episode) {
    throw new Error("not implemented: watch " + slug + "/" + episode);
  },
};
