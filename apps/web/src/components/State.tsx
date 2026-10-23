import type { ReactNode } from "react";
import { API_BASE } from "../lib/api";
import { Icon } from "./Icon";

export interface ErrorCardProps {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
  compact?: boolean;
}

export function ErrorCard({ message, onRetry, retryLabel = "Coba lagi", compact = false }: ErrorCardProps) {
  return (
    <div className={`error-card${compact ? " error-card--compact" : ""}`} role="alert">
      <p className="error-card__label mono mono--gold">Gangguan</p>
      <p className="error-card__msg">{message}</p>
      <div className="error-card__actions">
        {onRetry ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={onRetry}>
            <Icon name="arrowRight" size={13} />
            {retryLabel}
          </button>
        ) : null}
        {import.meta.env.DEV ? (
          <span className="mono mono--faint error-card__api">API {API_BASE}</span>
        ) : null}
      </div>
    </div>
  );
}

export interface EmptyStateProps {
  label: string;
  title: string;
  body?: string;
  children?: ReactNode;
}

export function EmptyState({ label, title, body, children }: EmptyStateProps) {
  return (
    <div className="empty">
      <p className="mono mono--faint">{label}</p>
      <p className="empty__title display">{title}</p>
      {body ? <p className="empty__body">{body}</p> : null}
      {children ? <div className="empty__actions">{children}</div> : null}
    </div>
  );
}

export interface NoticeProps {
  children: ReactNode;
  tone?: "warn" | "quiet";
}

export function Notice({ children, tone = "warn" }: NoticeProps) {
  return (
    <p className={`notice${tone === "quiet" ? " notice--quiet" : ""}`}>
      <Icon name="warning" size={14} />
      <span>{children}</span>
    </p>
  );
}
