import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

export interface RowProps {
  children: ReactNode;
  /** Accessible name for the carousel region. */
  label: string;
}

/**
 * Horizontal poster rail: scroll-snap, edge fades and arrow buttons that
 * disable themselves at the ends. Arrows stay out of the way on touch.
 */
export function Row({ children, label }: RowProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    const max = track.scrollWidth - track.clientWidth;
    setEdges({
      start: track.scrollLeft > 8,
      end: max > 8 && track.scrollLeft < max - 8,
    });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    Array.from(track.children).forEach((child) => observer.observe(child));
    return () => observer.disconnect();
  }, [children, measure]);

  const nudge = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    const amount = Math.max(track.clientWidth * 0.82, 240);
    const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    track.scrollBy({ left: direction * amount, behavior: smooth ? "smooth" : "auto" });
  };

  return (
    <div
      className="row"
      data-start={edges.start}
      data-end={edges.end}
      role="group"
      aria-roledescription="carousel"
      aria-label={label}
    >
      <div className="row__track no-scrollbar" ref={trackRef} onScroll={measure}>
        {children}
      </div>
      <button
        type="button"
        className="row__arrow row__arrow--prev"
        onClick={() => nudge(-1)}
        disabled={!edges.start}
        aria-label="Geser ke kiri"
        tabIndex={edges.start ? 0 : -1}
      >
        <Icon name="chevronLeft" size={18} />
      </button>
      <button
        type="button"
        className="row__arrow row__arrow--next"
        onClick={() => nudge(1)}
        disabled={!edges.end}
        aria-label="Geser ke kanan"
        tabIndex={edges.end ? 0 : -1}
      >
        <Icon name="chevronRight" size={18} />
      </button>
    </div>
  );
}
