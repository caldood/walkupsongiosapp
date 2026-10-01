import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useNav } from '../Nav';

export function Screen({ title, children, right, onBack }: { title: string; children: ReactNode; right?: ReactNode; onBack?: () => void }) {
  const nav = useNav();
  return (
    <div className="screen">
      <header className="topbar">
        <button className="btn-text" onClick={onBack ?? nav.back} aria-label="Back">
          ‹ Back
        </button>
        <h1>{title}</h1>
        <div className="topbar-right">{right}</div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

export function Section({ title, children, hint }: { title?: string; children: ReactNode; hint?: string }) {
  return (
    <section className="section">
      {title && <h2 className="section-title">{title}</h2>}
      {children}
      {hint && <p className="hint">{hint}</p>}
    </section>
  );
}

export function Banner({ kind = 'info', children, action }: { kind?: 'info' | 'warn' | 'error'; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={`banner banner-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <div>{children}</div>
      {action}
    </div>
  );
}

export function Toggle({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void; disabled?: boolean }) {
  return (
    <label className={`row toggle ${disabled ? 'disabled' : ''}`}>
      <span className="grow">
        <span className="row-title">{label}</span>
        {hint && <span className="row-sub">{hint}</span>}
      </span>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function Segmented<T extends string | number>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange(v: T): void; label: string }) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} role="radio" aria-checked={o.value === value} className={o.value === value ? 'on' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export interface ConfirmProps {
  title: string;
  message?: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm(): void;
  onCancel(): void;
}

/** In-app confirmation (consistent look; avoids the browser's window.confirm). */
export function ConfirmDialog({ title, message, confirmLabel, danger, onConfirm, onCancel }: ConfirmProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <h2>{title}</h2>
        {message && <p>{message}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small helper to drive ConfirmDialog from event handlers. */
export function useConfirm() {
  const [pending, setPending] = useState<Omit<ConfirmProps, 'onCancel' | 'onConfirm'> & { run(): void } | null>(null);
  const dialog = pending ? (
    <ConfirmDialog
      {...pending}
      onCancel={() => setPending(null)}
      onConfirm={() => {
        pending.run();
        setPending(null);
      }}
    />
  ) : null;
  return {
    dialog,
    ask: (opts: Omit<ConfirmProps, 'onCancel' | 'onConfirm'>, run: () => void) => setPending({ ...opts, run }),
  };
}

/** Press-and-hold button (prevents accidental taps for the screen lock). */
export function HoldButton({ label, holdMs = 700, onHold, className = '' }: { label: string; holdMs?: number; onHold(): void; className?: string }) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [holding, setHolding] = useState(false);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setHolding(false);
  };
  useEffect(() => clear, []);
  return (
    <button
      className={`btn hold ${holding ? 'holding' : ''} ${className}`}
      style={{ ['--hold-ms' as string]: `${holdMs}ms` }}
      onPointerDown={() => {
        setHolding(true);
        timer.current = setTimeout(() => {
          clear();
          onHold();
        }, holdMs);
      }}
      onPointerUp={clear}
      onPointerLeave={clear}
      onPointerCancel={clear}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span>{label}</span>
    </button>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}
