import type { SourceAdapter, SourceId } from "@onyxchin/shared";
import { rajadonghua } from "./sources/rajadonghua.js";
import { anichin } from "./sources/anichin.js";
import { animexin } from "./sources/animexin.js";
import { yunshanid } from "./sources/yunshanid.js";
import { donghuaworld } from "./sources/donghuaworld.js";

export const sources: Record<SourceId, SourceAdapter> = {
  rajadonghua,
  anichin,
  animexin,
  yunshanid,
  donghuaworld,
};

export const sourceList = Object.values(sources);
