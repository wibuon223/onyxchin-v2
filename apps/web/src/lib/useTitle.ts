import { useEffect } from "react";

/** Sets `document.title` for the lifetime of a page component. */
export function useTitle(title: string | null): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = `${title} — OnyxChin`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
