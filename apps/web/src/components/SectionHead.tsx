import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Icon } from "./Icon";

export interface SectionHeadProps {
  /** 1-based folio number, rendered as `01 —`. */
  index: number;
  title: string;
  href?: string;
  external?: boolean;
  hrefLabel?: string;
  aside?: ReactNode;
  /** Optional heading id so sections can be labelled by their heading. */
  id?: string;
}

export function SectionHead({
  index,
  title,
  href,
  external = false,
  hrefLabel = "Lihat semua",
  aside,
  id,
}: SectionHeadProps) {
  const more = href ? (
    external ? (
      <a
        className="sect-head__more mono"
        href={href}
        target="_blank"
        rel="noreferrer"
      >
        {hrefLabel}
        <Icon name="external" size={12} />
      </a>
    ) : (
      <Link className="sect-head__more mono" to={href}>
        {hrefLabel}
        <Icon name="arrowRight" size={13} />
      </Link>
    )
  ) : null;

  return (
    <div className="sect-head">
      <h2 className="sect-head__title" id={id}>
        <span className="sect-head__index mono">{String(index).padStart(2, "0")} —</span>
        <span className="sect-head__name display">{title}</span>
      </h2>
      <span className="sect-head__rule" aria-hidden="true" />
      {more}
      {aside}
    </div>
  );
}
