import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import {
  generateCode,
  getSyncCode,
  normalizeCode,
  pullProgress,
  pushProgress,
  setSyncCode,
} from "../lib/sync";

export interface SyncDialogProps {
  open: boolean;
  onClose: () => void;
}

type Phase = "idle" | "working" | "done" | "error";

/**
 * Pair two devices by typing the same code. No account, no email — the code is
 * the whole identity, and it can be revoked by generating a new one.
 */
export function SyncDialog({ open, onClose }: SyncDialogProps) {
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");
  const [active, setActive] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const current = getSyncCode();
    setActive(current);
    setCode(current ?? "");
    setPhase("idle");
    setMessage("");
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const normalized = normalizeCode(code);
  const valid = normalized.length >= 6;

  const save = async () => {
    if (!valid) return;
    setSyncCode(normalized);
    setActive(normalized);
    setPhase("working");
    setMessage("Menyambungkan…");
    const pulled = await pullProgress(normalized);
    if (pulled.error && pulled.error !== "empty") {
      setPhase("error");
      setMessage(
        pulled.error === "offline"
          ? "Server tidak terjangkau. Riwayat lokal tetap aman."
          : `Gagal menyambung (${pulled.error}).`
      );
      return;
    }
    const pushed = await pushProgress(normalized);
    if (pushed.error && pushed.error !== "empty" && pushed.error !== "busy") {
      setPhase("error");
      setMessage(`Gagal mengunggah (${pushed.error}).`);
      return;
    }
    setPhase("done");
    setMessage(`Tersinkron · ${pushed.entries || pulled.entries} judul`);
  };

  const disconnect = () => {
    setSyncCode(null);
    setActive(null);
    setCode("");
    setPhase("idle");
    setMessage("Sinkron dimatikan. Riwayat lokal tidak dihapus.");
  };

  return (
    <div className="cmdk">
      <button
        type="button"
        className="cmdk__backdrop"
        aria-label="Tutup sinkron"
        onClick={onClose}
        tabIndex={-1}
      />
      <div className="cmdk__panel sync" role="dialog" aria-modal="true" aria-label="Sinkron antar perangkat">
        <div className="sync__head">
          <Icon name="link" size={16} />
          <p className="sync__title">Sinkron antar perangkat</p>
          <button type="button" className="icon-btn" aria-label="Tutup" onClick={onClose}>
            <Icon name="close" size={15} />
          </button>
        </div>

        <p className="sync__body prose">
          Tonton di ponsel, lanjutkan di laptop. Masukkan kode yang sama di kedua
          perangkat — tanpa akun, tanpa email.
        </p>

        <label className="sync__label mono mono--faint" htmlFor="sync-code">
          Kode perangkat
        </label>
        <div className="sync__row">
          <input
            id="sync-code"
            ref={inputRef}
            className="sync__input mono"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void save();
            }}
            placeholder="mis. k7m2-9xqa"
            autoComplete="off"
            spellCheck={false}
            maxLength={27}
          />
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => setCode(generateCode())}
          >
            Buat kode
          </button>
        </div>

        <div className="sync__actions">
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => void save()}
            disabled={!valid || phase === "working"}
          >
            {phase === "working" ? "Menyinkronkan…" : "Simpan & sinkron"}
          </button>
          {active ? (
            <button type="button" className="btn btn--ghost btn--sm" onClick={disconnect}>
              Matikan
            </button>
          ) : null}
        </div>

        {message ? (
          <p
            className={`sync__status mono ${phase === "error" ? "mono--gold" : "mono--faint"}`}
            role="status"
          >
            {message}
          </p>
        ) : null}
      </div>
    </div>
  );
}
