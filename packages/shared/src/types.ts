/** Shared contract for every OnyxChin source adapter. */

export type SourceId = "rajadonghua" | "anichin" | "animexin" | "donghuaworld";

export interface Card {
  id: string;
  slug: string;
  title: string;
  poster: string | null;
  type?: string;
  status?: string;
  year?: number;
  rating?: number;
  episodes?: number;
  genres?: string[];
}

export interface Episode {
  number: number;
  slug: string;
  title?: string;
  releasedAt?: string;
}

export interface Anime {
  id: string;
  slug: string;
  title: string;
  altTitles?: string[];
  synopsis?: string;
  poster: string | null;
  banner?: string | null;
  type?: string;
  status?: string;
  year?: number;
  rating?: number;
  genres?: string[];
  studio?: string;
  totalEpisodes?: number;
  sourceId: SourceId;
}

export type SourceKind = "direct" | "hls" | "iframe" | "external";

export interface VideoSource {
  id: string;
  label: string;
  kind: SourceKind;
  /** Playable URL: direct mp4/hls for kind=direct|hls, embed URL for iframe, page for external. */
  url: string;
  quality?: string;
  lang?: string;
  note?: string;
  playable: boolean;
}

export interface SubtitleTrack {
  label: string;
  lang: string;
  url: string;
}

export interface HomePayload {
  hero: Card[];
  sections: { title: string; items: Card[]; href?: string }[];
}

export interface ListPayload {
  items: Card[];
  page: number;
  hasNext: boolean;
  totalPages?: number;
}

export interface DetailPayload {
  anime: Anime;
  episodes: Episode[];
  related?: Card[];
}

export interface WatchPayload {
  anime: Anime;
  episode: Episode;
  sources: VideoSource[];
  subtitles: SubtitleTrack[];
  prev?: Episode;
  next?: Episode;
}

export interface SourceAdapter {
  id: SourceId;
  name: string;
  baseUrl: string;
  lang: string;
  home(): Promise<HomePayload>;
  list(params: { page: number; genre?: string; status?: string; order?: string }): Promise<ListPayload>;
  search(query: string): Promise<Card[]>;
  detail(slug: string): Promise<DetailPayload>;
  watch(slug: string, episode: string): Promise<WatchPayload>;
}

export interface SourceMeta {
  id: SourceId;
  name: string;
  baseUrl: string;
  lang: string;
  status: "live" | "degraded" | "offline";
  playback: string[];
  notes?: string;
}
