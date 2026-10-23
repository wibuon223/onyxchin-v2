import { useEffect, useRef, useState } from "react";
import { errorMessage, isAbortError } from "./api";

export interface AsyncState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  reload: () => void;
}

/**
 * Runs an abortable fetch whenever `deps` change. Data is cleared on every new
 * run so a source switch never flashes another source's catalogue.
 */
export function useAsync<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  deps: readonly unknown[],
): AsyncState<T> {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({
    data: null,
    error: null,
    loading: true,
  });
  const [attempt, setAttempt] = useState(0);
  const factoryRef = useRef(factory);
  factoryRef.current = factory;

  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setState({ data: null, error: null, loading: true });
    Promise.resolve()
      .then(() => factoryRef.current(controller.signal))
      .then(
        (data) => {
          if (!alive) return;
          setState({ data, error: null, loading: false });
        },
        (error: unknown) => {
          if (!alive || controller.signal.aborted || isAbortError(error)) return;
          setState({ data: null, error: errorMessage(error), loading: false });
        },
      );
    return () => {
      alive = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- callers own the dep list
  }, [...deps, attempt]);

  return {
    ...state,
    reload: () => setAttempt((value) => value + 1),
  };
}
