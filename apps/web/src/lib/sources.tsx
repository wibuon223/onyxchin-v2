import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { getSources, type SourceInfo } from "./api";
import { readSourcePref, writeSourcePref } from "./prefs";

/**
 * Source ids and names are mirrored here so the switcher still works while the
 * API is asleep (Render free instances cold-start). The live list replaces it.
 */
export const FALLBACK_SOURCES: SourceInfo[] = [
  { id: "rajadonghua", name: "Raja Donghua", baseUrl: "https://rajadonghua.com", lang: "id" },
  { id: "anichin", name: "Anichin", baseUrl: "https://anichin.my", lang: "id" },
  { id: "animexin", name: "AnimeXin", baseUrl: "https://animexin.dev", lang: "id" },
  { id: "yunshanid", name: "YunshanID", baseUrl: "https://yunshanid.site", lang: "id" },
  { id: "donghuaworld", name: "Donghua World", baseUrl: "https://donghuaworld.com", lang: "id" },
];

export const DEFAULT_SOURCE = FALLBACK_SOURCES[0].id;

interface SourcesContextValue {
  sources: SourceInfo[];
  source: string;
  sourceInfo: SourceInfo | null;
  setSource: (id: string) => void;
  /** True when the list came from the API rather than the mirror. */
  live: boolean;
}

const SourcesContext = createContext<SourcesContextValue | null>(null);

export function SourcesProvider({ children }: { children: ReactNode }) {
  const [sources, setSources] = useState<SourceInfo[]>(FALLBACK_SOURCES);
  const [source, setSourceState] = useState<string>(() => readSourcePref() ?? DEFAULT_SOURCE);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getSources(controller.signal)
      .then((list) => {
        if (!list.length) return;
        setSources(list);
        setLive(true);
        setSourceState((current) =>
          list.some((item) => item.id === current) ? current : list[0].id,
        );
      })
      .catch(() => {
        /* Offline or cold API: the mirrored list keeps the switcher usable. */
      });
    return () => controller.abort();
  }, []);

  const setSource = useCallback((id: string) => {
    setSourceState(id);
    writeSourcePref(id);
  }, []);

  const sourceInfo = useMemo(
    () => sources.find((item) => item.id === source) ?? null,
    [sources, source],
  );

  const value = useMemo(
    () => ({ sources, source, sourceInfo, setSource, live }),
    [sources, source, sourceInfo, setSource, live],
  );

  return <SourcesContext.Provider value={value}>{children}</SourcesContext.Provider>;
}

export function useSources(): SourcesContextValue {
  const value = useContext(SourcesContext);
  if (!value) throw new Error("useSources harus dipakai di dalam SourcesProvider");
  return value;
}
