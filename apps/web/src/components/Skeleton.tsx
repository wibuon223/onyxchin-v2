/** Layout-matched skeletons: the page keeps its shape while data arrives. */

function Cards({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <div className="sk-card" key={index} aria-hidden="true">
          <div className="skeleton sk-card__frame" />
          <div className="skeleton sk-line" style={{ width: "84%" }} />
          <div className="skeleton sk-line sk-line--sm" style={{ width: "48%" }} />
        </div>
      ))}
    </>
  );
}

export function RowSkeleton({ count = 7 }: { count?: number }) {
  return (
    <div className="row" data-start="false" data-end="false" aria-hidden="true">
      <div className="row__track no-scrollbar">
        <Cards count={count} />
      </div>
    </div>
  );
}

export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <div className="poster-grid" aria-hidden="true">
      <Cards count={count} />
    </div>
  );
}

export function HeroSkeleton() {
  return (
    <div className="hero hero--skeleton" aria-hidden="true">
      <div className="container hero__inner">
        <div className="hero__copy">
          <div className="skeleton sk-line" style={{ width: 140 }} />
          <div className="skeleton sk-line sk-line--xl" style={{ width: "72%", marginTop: 24 }} />
          <div className="skeleton sk-line" style={{ width: "48%", marginTop: 26 }} />
          <div className="skeleton sk-line" style={{ width: "62%" }} />
          <div className="skeleton sk-line" style={{ width: 210, marginTop: 30, height: 42, borderRadius: 999 }} />
        </div>
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div className="detail-page container" aria-hidden="true">
      <div className="skeleton detail-page__poster" />
      <div className="detail-page__body">
        <div className="skeleton sk-line" style={{ width: 160 }} />
        <div className="skeleton sk-line sk-line--xl" style={{ width: "66%", marginTop: 22 }} />
        <div className="skeleton sk-line" style={{ width: "40%", marginTop: 18 }} />
        <div className="skeleton sk-line" style={{ width: "100%", marginTop: 32 }} />
        <div className="skeleton sk-line" style={{ width: "94%" }} />
        <div className="skeleton sk-line" style={{ width: "72%" }} />
        <div className="detail-page__eps-skeleton">
          {Array.from({ length: 18 }, (_, index) => (
            <div className="skeleton sk-ep" key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function WatchSkeleton() {
  return (
    <div className="watch-page container" aria-hidden="true">
      <div className="skeleton sk-line" style={{ width: 220 }} />
      <div className="skeleton watch-page__stage-skeleton" />
      <div className="skeleton sk-line sk-line--xl" style={{ width: "52%", marginTop: 28 }} />
      <div className="skeleton sk-line" style={{ width: "34%", marginTop: 16 }} />
      <div className="watch-page__chip-skeleton">
        <div className="skeleton sk-chip" />
        <div className="skeleton sk-chip" />
        <div className="skeleton sk-chip" />
      </div>
    </div>
  );
}
