import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { apiClient } from '@/api/client';

export const Route = createFileRoute('/account/licenses')({
  component: AccountLicenses,
});

interface Entitlement {
  id: string;
  sourceProvider: string;
  productId: string;
  sourceReference: string | null;
  status: string;
  grantedAt: number;
  revokedAt: number | null;
}

interface Subject {
  id: string;
  displayName: string | null;
  status: string;
  entitlements: Entitlement[];
}

interface LicensesResponse {
  subjects: Subject[];
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function providerIconPath(providerKey: string): string | null {
  const map: Record<string, string> = {
    gumroad: '/Icons/gumroad.png',
    jinxxy: '/Icons/jinxxy.png',
    lemonsqueezy: '/Icons/lemonsqueezy.png',
    payhip: '/Icons/payhip.png',
  };
  return map[providerKey.toLowerCase()] ?? null;
}

function EntitlementRow({ entitlement, onRevoke }: { entitlement: Entitlement; onRevoke: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  const revokeMut = useMutation({
    mutationFn: () =>
      apiClient.delete(`/api/connect/user/entitlements/${entitlement.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-licenses'] });
      setConfirming(false);
      onRevoke(entitlement.id);
    },
  });

  const iconPath = providerIconPath(entitlement.sourceProvider);

  return (
    <div className="account-list-row">
      <div className="account-list-row-icon">
        {iconPath ? (
          <img src={iconPath} alt={entitlement.sourceProvider} width="20" height="20" />
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <path d="M9 9h6M9 13h4" />
          </svg>
        )}
      </div>
      <div className="account-list-row-info">
        <p className="account-list-row-name">
          {entitlement.productId}
        </p>
        <p className="account-list-row-meta">
          <span className="account-badge account-badge--provider">{entitlement.sourceProvider}</span>
          {entitlement.sourceReference && (
            <span style={{ fontSize: '11px', fontFamily: 'monospace', opacity: 0.6 }}>
              {entitlement.sourceReference.slice(0, 12)}&hellip;
            </span>
          )}
          <span>{formatDate(entitlement.grantedAt)}</span>
        </p>
      </div>
      <div className="account-list-row-actions">
        <span className={`account-badge account-badge--${entitlement.status}`}>
          {entitlement.status.charAt(0).toUpperCase() + entitlement.status.slice(1)}
        </span>
        {entitlement.status === 'active' && !confirming && (
          <button
            type="button"
            className="account-btn account-btn--danger"
            onClick={() => setConfirming(true)}
          >
            Deactivate
          </button>
        )}
        {confirming && (
          <div className="account-modal-backdrop" onClick={() => setConfirming(false)}>
            <div className="account-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="account-modal-title">Deactivate license?</h3>
              <p className="account-modal-body">
                This will remove your Discord role. Re-verification requires the full verify
                flow. This cannot be undone immediately.
              </p>
              <div className="account-modal-actions">
                <button
                  type="button"
                  className="account-btn account-btn--secondary"
                  onClick={() => setConfirming(false)}
                  disabled={revokeMut.isPending}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className={`account-btn account-btn--danger${revokeMut.isPending ? ' btn-loading' : ''}`}
                  onClick={() => revokeMut.mutate()}
                  disabled={revokeMut.isPending}
                >
                  {revokeMut.isPending && <span className="btn-loading-spinner" aria-hidden="true" />}
                  {revokeMut.isPending ? 'Deactivating...' : 'Deactivate'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountLicenses() {
  const { data, isLoading, isError } = useQuery<LicensesResponse>({
    queryKey: ['user-licenses'],
    queryFn: () => apiClient.get<LicensesResponse>('/api/connect/user/licenses'),
  });

  const allEntitlements = (data?.subjects ?? []).flatMap((s) => s.entitlements);
  const hasEntitlements = allEntitlements.length > 0;

  return (
    <>
      <section className="account-section">
        <div className="account-section-header">
          <h2 className="account-section-title">Verified Purchases</h2>
          <p className="account-section-desc">
            Licenses verified through Discord server bots
          </p>
        </div>
        <div className="account-section-body">
          {isLoading && (
            <>
              <div className="account-skeleton-row" style={{ width: '60%', height: '16px' }} />
              <div className="account-skeleton-row" style={{ width: '80%', height: '16px' }} />
              <div className="account-skeleton-row" style={{ width: '45%', height: '16px' }} />
            </>
          )}
          {isError && (
            <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>
              Failed to load licenses. Please refresh.
            </p>
          )}
          {!isLoading && !isError && !hasEntitlements && (
            <div className="account-empty">
              <div className="account-empty-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M9 9h6M9 13h4" />
                </svg>
              </div>
              <p className="account-empty-title">No verified purchases yet</p>
              <p className="account-empty-desc">
                Join a Discord server that uses this bot, then run{' '}
                <code style={{ fontSize: '12px', background: 'rgba(0,0,0,.06)', padding: '1px 5px', borderRadius: '4px' }}>/verify</code>{' '}
                to link your purchase.
              </p>
            </div>
          )}
          {!isLoading && !isError && hasEntitlements && (
            allEntitlements.map((e) => (
              <EntitlementRow key={e.id} entitlement={e} onRevoke={() => {}} />
            ))
          )}
        </div>
      </section>
    </>
  );
}
