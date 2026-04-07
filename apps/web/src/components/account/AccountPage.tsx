import { type ReactNode, useEffect, useId, useRef } from 'react';

function joinClasses(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

export function AccountPage({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <div className="dashboard-tab-panel is-active account-dashboard-view">
      <div className="bento-grid account-bento-grid">{children}</div>
    </div>
  );
}

export function AccountSectionCard({
  eyebrow,
  title,
  description,
  actions,
  className,
  bodyClassName,
  footer,
  children,
}: Readonly<{
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  footer?: ReactNode;
  children: ReactNode;
}>) {
  return (
    <section className={joinClasses('section-card account-surface-card', className)}>
      <div className="account-surface-card-header">
        <div className="account-surface-card-copy">
          {eyebrow ? <div className="account-surface-card-eyebrow">{eyebrow}</div> : null}
          <h3 className="account-surface-card-title">{title}</h3>
          {description ? <p className="account-surface-card-desc">{description}</p> : null}
        </div>
        {actions ? <div className="account-surface-card-actions">{actions}</div> : null}
      </div>

      <div className={joinClasses('account-surface-card-body', bodyClassName)}>{children}</div>

      {footer ? <div className="account-surface-card-footer">{footer}</div> : null}
    </section>
  );
}

export function AccountEmptyState({
  icon,
  title,
  description,
  action,
}: Readonly<{
  icon: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}>) {
  return (
    <div className="account-empty">
      <div className="account-empty-icon" aria-hidden="true">
        {icon}
      </div>
      <p className="account-empty-title">{title}</p>
      <div className="empty-state-copy">{description}</div>
      {action ? <div className="account-empty-action">{action}</div> : null}
    </div>
  );
}

export function AccountInlineError({ message }: Readonly<{ message: string }>) {
  return (
    <p className="account-inline-error" role="alert">
      {message}
    </p>
  );
}

export function AccountModal({
  title,
  onClose,
  closeLabel = 'Close dialog',
  children,
}: Readonly<{
  title: string;
  onClose: () => void;
  closeLabel?: string;
  children: ReactNode;
}>) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();

    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    }

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Focus trap: keep keyboard focus within the dialog while open
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const FOCUSABLE =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function handleTab(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const focusable = Array.from(dialog?.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    }

    dialog.addEventListener('keydown', handleTab);
    return () => dialog.removeEventListener('keydown', handleTab);
  }, []);

  return (
    <div className="account-modal-backdrop" role="presentation">
      <button
        type="button"
        className="account-modal-scrim"
        aria-label={closeLabel}
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        className="account-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <h3 id={titleId} className="account-modal-title">
          {title}
        </h3>
        {children}
      </div>
    </div>
  );
}
