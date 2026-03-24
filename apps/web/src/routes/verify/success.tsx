import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { routeStyleHrefs, routeStylesheetLinks } from '@/lib/routeStyles';

export const Route = createFileRoute('/verify/success')({
  head: () => ({
    meta: [{ title: 'Verification Successful | Creator Assistant' }],
    links: routeStylesheetLinks(routeStyleHrefs.verifySuccess),
  }),
  component: VerifySuccessPage,
});

function getSafeReturnTo(value: string | null): string | null {
  if (!value || typeof window === 'undefined') return null;
  try {
    const url = new URL(value, window.location.origin);
    const allowedOrigins = new Set([
      'https://discord.com',
      'https://ptb.discord.com',
      'https://canary.discord.com',
      window.location.origin,
    ]);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    if (!allowedOrigins.has(url.origin)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function VerifySuccessPage() {
  const [redirectText, setRedirectText] = useState('Redirecting in 5 seconds...');
  const [isVisible, setIsVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
  const panelToken = params.get('panelToken');
  const returnTo = params.get('returnTo');
  const safeReturnTo = getSafeReturnTo(returnTo);
  const deepLink = safeReturnTo
    ? safeReturnTo.replace(/^http(s)?:\/\/(ptb\.|canary\.)?discord\.com/, 'discord://-')
    : null;

  const handleClose = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    window.close();
  }, []);

  useEffect(() => {
    setIsVisible(true);

    if (panelToken) {
      fetch('/api/verification/panel/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ panelToken }),
      }).catch(() => {});
    }

    if (typeof window !== 'undefined' && 'confetti' in window) {
      const confetti = (window as unknown as Record<string, unknown>).confetti as (
        opts: Record<string, unknown>
      ) => void;
      if (typeof confetti === 'function') {
        confetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
          colors: ['#ffeb3b', '#0ea5e9', '#00e676', '#ffffff'],
          disableForReducedMotion: true,
        });
      }
    }

    if (safeReturnTo && deepLink) {
      let count = 5;
      intervalRef.current = setInterval(() => {
        count--;
        setRedirectText(
          count > 0
            ? `Redirecting to app in ${count} second${count !== 1 ? 's' : ''}...`
            : 'Redirecting...'
        );
        if (count <= 0) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          window.location.href = deepLink;
          setTimeout(() => {
            window.location.href = safeReturnTo;
          }, 2500);
        }
      }, 1000);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [panelToken, safeReturnTo, deepLink]);

  return (
    <div className="verify-success-page-wrapper">
      <main className={`verify-success-page${isVisible ? ' is-visible' : ''}`}>
        <section className="verify-success-card">
          <div className="verify-success-eyebrow fade-up" style={{ animationDelay: '0.15s' }}>
            Verification complete
          </div>

          <div className="verify-success-icon-ring fade-up" style={{ animationDelay: '0.25s' }}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M20 7 10.5 16.5 6 12" />
            </svg>
          </div>

          <h1 className="verify-success-title fade-up" style={{ animationDelay: '0.35s' }}>
            You're verified
          </h1>

          <p className="verify-success-subtitle fade-up" style={{ animationDelay: '0.45s' }}>
            Your Discord account has been verified. Your roles will update shortly, and you can head
            back to Discord now.
          </p>

          <div className="verify-success-note fade-up" style={{ animationDelay: '0.55s' }}>
            <div className="verify-success-note-label">Next</div>
            <p className="verify-success-note-copy">
              {safeReturnTo
                ? 'We will try to reopen Discord automatically. If it does not open, use the button below or continue in your browser.'
                : 'Verification is complete. You can close this tab and return to Discord whenever you are ready.'}
            </p>
          </div>

          <div className="verify-success-actions fade-up" style={{ animationDelay: '0.65s' }}>
            {safeReturnTo && deepLink ? (
              <>
                <a
                  id="return-btn"
                  href={deepLink}
                  className="verify-success-btn verify-success-btn--primary"
                >
                  Open Discord app
                </a>
                <a
                  id="return-web-btn"
                  href={safeReturnTo}
                  className="verify-success-btn verify-success-btn--ghost"
                >
                  Continue in browser
                </a>
              </>
            ) : (
              <button
                id="return-btn"
                type="button"
                onClick={handleClose}
                className="verify-success-btn verify-success-btn--primary"
              >
                Close tab
              </button>
            )}
          </div>

          {safeReturnTo ? (
            <div
              id="redirect-msg"
              className="verify-success-status fade-up"
              style={{ animationDelay: '0.75s' }}
            >
              {redirectText}
            </div>
          ) : (
            <div
              id="close-msg"
              className="verify-success-status fade-up"
              style={{ animationDelay: '0.75s' }}
            >
              You can close this tab.
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
