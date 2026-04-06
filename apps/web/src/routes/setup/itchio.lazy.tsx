import { createLazyFileRoute } from '@tanstack/react-router';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BackgroundCanvasRoot } from '@/components/page/BackgroundCanvasRoot';
import { buildSetupAuthQuery } from '@/lib/setupAuth';
import { resolveSetupApiBase } from './lemonsqueezySetupSupport';

export const Route = createLazyFileRoute('/setup/itchio')({
  component: ItchioSetupPage,
});

function getUrlParams(): {
  tenantId: string;
  guildId: string;
  apiBase: string;
} {
  if (typeof window === 'undefined') {
    return { tenantId: '', guildId: '', apiBase: '' };
  }

  const params = new URLSearchParams(window.location.search);
  const resolveApiBase = (raw: string | null) => resolveSetupApiBase(raw, window.location.origin);

  return {
    tenantId: params.get('tenant_id') || params.get('tenantId') || '',
    guildId: params.get('guild_id') || params.get('guildId') || '',
    apiBase: resolveApiBase(params.get('api_base')),
  };
}

async function bootstrapSetupSession(apiBase: string): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const setupToken = hash.get('s');
  const accessToken = hash.get('access_token');
  if (!setupToken || accessToken) return false;

  const response = await fetch(`${apiBase}/api/connect/bootstrap`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ setupToken }),
  });
  if (!response.ok) {
    const errorUrl = new URL(`${apiBase}/verify-error`, window.location.origin);
    errorUrl.searchParams.set('error', 'link_expired');
    window.location.replace(errorUrl.toString());
    return true;
  }

  window.history.replaceState({}, '', window.location.pathname + window.location.search);
  window.location.reload();
  return true;
}

function ItchioSetupPage() {
  const { tenantId, guildId, apiBase } = getUrlParams();
  const [phase, setPhase] = useState<'idle' | 'redirecting' | 'processing' | 'success' | 'error'>(
    'idle'
  );
  const [error, setError] = useState<string | null>(null);

  const dashboardUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/dashboard';
    const url = new URL(`${apiBase}/dashboard`, window.location.origin);
    if (tenantId) url.searchParams.set('tenant_id', tenantId);
    if (guildId) url.searchParams.set('guild_id', guildId);
    return url.toString();
  }, [apiBase, guildId, tenantId]);

  const beginUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/api/connect/itchio/begin';
    const path = buildSetupAuthQuery('/api/connect/itchio/begin', tenantId);
    const url = new URL(`${apiBase}${path}`, window.location.origin);
    if (guildId) {
      url.searchParams.set('guildId', guildId);
    }
    return url.toString();
  }, [apiBase, guildId, tenantId]);

  const startConnect = useCallback(() => {
    setPhase('redirecting');
    window.location.replace(beginUrl);
  }, [beginUrl]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const bootstrapped = await bootstrapSetupSession(apiBase).catch(() => false);
      if (bootstrapped || cancelled || typeof window === 'undefined') {
        return;
      }

      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
      const accessToken = hash.get('access_token');
      const state = hash.get('state');
      if (!accessToken || !state) {
        return;
      }

      setPhase('processing');
      setError(null);
      window.history.replaceState({}, '', window.location.pathname + window.location.search);

      const response = await fetch(`${apiBase}/api/connect/itchio/finish`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accessToken, state }),
      });

      const data = (await response.json().catch(() => ({}))) as {
        success?: boolean;
        error?: string;
        redirectUrl?: string;
      };

      if (!response.ok || !data.success || !data.redirectUrl) {
        if (!cancelled) {
          setPhase('error');
          setError(data.error ?? 'Could not finish itch.io setup.');
        }
        return;
      }

      if (cancelled) {
        return;
      }

      setPhase('success');
      window.setTimeout(() => {
        window.location.replace(data.redirectUrl ?? dashboardUrl);
      }, 900);
    }

    run().catch((caughtError) => {
      if (!cancelled) {
        setPhase('error');
        setError(
          caughtError instanceof Error ? caughtError.message : 'Could not finish itch.io setup.'
        );
      }
    });

    return () => {
      cancelled = true;
    };
  }, [apiBase, dashboardUrl]);

  const statusCopy =
    phase === 'processing'
      ? 'Finalizing your itch.io connection...'
      : phase === 'redirecting'
        ? 'Redirecting to itch.io...'
        : phase === 'success'
          ? 'itch.io connected. Sending you back to the dashboard...'
          : phase === 'error'
            ? (error ?? 'Could not finish itch.io setup.')
            : 'Connect your itch.io account to sync games and verify download keys.';

  return (
    <div className="min-h-screen bg-[#0b0b10] text-white">
      <BackgroundCanvasRoot position="absolute" />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
        <a
          href={dashboardUrl}
          className="mb-8 inline-flex w-fit items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white/75 transition hover:bg-white/10 hover:text-white"
          style={{ textDecoration: 'none' }}
        >
          <ArrowLeft size={14} />
          Dashboard
        </a>

        <div className="rounded-[28px] border border-white/10 bg-black/40 p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-[#fa5c5c]/30 bg-[#fa5c5c]/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[#ffb8b8]">
            itch.io
          </div>
          <h1 className="text-3xl font-black tracking-tight sm:text-4xl">Connect itch.io</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-white/70">{statusCopy}</p>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm text-white/75">
            <div className="font-semibold text-white">Scopes requested</div>
            <ul className="mt-3 space-y-2">
              <li>1. `profile:me` to identify the connected creator account</li>
              <li>2. `profile:games` to sync your itch.io games into product selection</li>
              <li>3. `game:view:purchases` to verify download keys against creator-owned games</li>
            </ul>
          </div>

          {phase === 'idle' && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startConnect}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fa5c5c] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#ff7373]"
              >
                Continue to itch.io
                <ExternalLink size={16} />
              </button>
              <a
                href="https://itch.io/docs/api/oauth"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                style={{ textDecoration: 'none' }}
              >
                Review docs
                <ExternalLink size={16} />
              </a>
            </div>
          )}

          {phase === 'error' && (
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={startConnect}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-[#fa5c5c] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#ff7373]"
              >
                Try again
                <ExternalLink size={16} />
              </button>
              <a
                href={dashboardUrl}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-white/80 transition hover:bg-white/10 hover:text-white"
                style={{ textDecoration: 'none' }}
              >
                Back to dashboard
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
