/** Scroll spy driven by IntersectionObserver with a cheap rAF fallback. */

export function createScrollSpy(ids: string[], onChange: (id: string) => void): () => void {
  const visible = new Set<string>();
  const hitLine = 112;
  let last = "";

  const compute = (): string | null => {
    let active: string | null = null;
    for (const id of ids) {
      const el = document.getElementById(id);
      if (!el) continue;
      if (el.getBoundingClientRect().top - hitLine <= 0) active = id;
    }
    return active;
  };

  const notify = (id: string | null): void => {
    if (!id || id === last) return;
    last = id;
    onChange(id);
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target as HTMLElement;
        const id = target.dataset.spyId ?? target.id;
        if (entry.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      const firstVisible = ids.find((id) => visible.has(id)) ?? null;
      notify(compute() ?? firstVisible);
    },
    { rootMargin: "-56px 0px -66% 0px", threshold: 0 },
  );

  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  }

  let raf = 0;
  const onScroll = (): void => {
    if (raf !== 0) return;
    raf = window.requestAnimationFrame(() => {
      raf = 0;
      notify(compute());
    });
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });

  notify(compute() ?? ids[0] ?? null);

  return () => {
    observer.disconnect();
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    if (raf !== 0) window.cancelAnimationFrame(raf);
  };
}
