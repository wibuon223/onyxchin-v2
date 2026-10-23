import { sourceShortName } from "../lib/format";
import { useSources } from "../lib/sources";

export interface SourceSegmentedProps {
  /** Short labels for tight spaces (Raja, Anichin, DHW…). */
  compact?: boolean;
  /** Let the control wrap instead of scrolling horizontally. */
  wrap?: boolean;
  className?: string;
}

export function SourceSegmented({ compact = false, wrap = false, className }: SourceSegmentedProps) {
  const { sources, source, setSource } = useSources();
  const classes = ["seg", wrap ? "seg--wrap" : "", className ?? ""].filter(Boolean).join(" ");

  return (
    <div className={classes} role="group" aria-label="Pilih sumber">
      {sources.map((item) => (
        <button
          key={item.id}
          type="button"
          className="seg__btn"
          aria-pressed={item.id === source}
          title={item.name}
          onClick={() => setSource(item.id)}
        >
          {compact ? sourceShortName(item.id, item.name) : item.name}
        </button>
      ))}
    </div>
  );
}
