import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { apiClient } from '@/api/client';

export const Route = createFileRoute('/account/authorized-apps')({
  component: AccountAuthorizedApps,
});

interface OAuthGrant {
  consentId: string;
  clientId: string;
  appName: string;
  scopes: string[];
  grantedAt: number | null;
  updatedAt: number | null;
}

interface GrantsResponse {
  grants: OAuthGrant[];
}

function formatDate(ts: number | null): string {
  if (!ts) return 'Unknown date';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function GrantRow({ grant, onRevoked }: { grant: OAuthGrant; onRevoked: (id: string) => void }) {
  const [confirming, setConfirming] = useState(false);
  const queryClient = useQueryClient();

  const revokeMut = useMutation({
    mutationFn: () =>
      apiClient.delete(`/api/connect/user/oauth/grants/${encodeURIComponent(grant.consentId)}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-oauth-grants'] });
      setConfirming(false);
      onRevoked(grant.consentId);
    },
  });

  return (
    <div className="account-list-row">
      <div className="account-list-row-icon" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
        </svg>
      </div>
      <div className="account-list-row-info">
        <p className="account-list-row-name">{grant.appName}</p>
        <p className="account-list-row-meta">
          <span style={{ fontFamily: 'monospace', fontSize: '11px', opacity: 0.6 }}>
            {grant.clientId}
          </span>
          {grant.grantedAt && <span>Authorized {formatDate(grant.grantedAt)}</span>}
        </p>
        {grant.scopes.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
            {grant.scopes.map((scope) => (
              <span key={scope} className="account-badge account-badge--scope">
                {scope}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="account-list-row-actions">
        {!confirming && (
          <button
            type="button"
            className="account-btn account-btn--danger"
            onClick={() => setConfirming(true)}
          >
            Revoke
          </button>
        )}
        {confirming && (
          <div className="account-modal-backdrop" onClick={() => setConfirming(false)}>
            <div className="account-modal" onClick={(e) => e.stopPropagation()}>
              <h3 className="account-modal-title">Revoke {grant.appName}?</h3>
              <p className="account-modal-body">
                Revoking will immediately disconnect <strong>{grant.appName}</strong> and
                invalidate all its access tokens. The app will need to be re-authorized.
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
                  {revokeMut.isPending ? 'Revoking...' : 'Revoke access'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AccountAuthorizedApps() {
  const { data, isLoading, isError } = useQuery<GrantsResponse>({
    queryKey: ['user-oauth-grants'],
    queryFn: () => apiClient.get<GrantsResponse>('/api/connect/user/oauth/grants'),
  });

  const grants = data?.grants ?? [];

  return (
    <section className="account-section">
      <div className="account-section-header">
        <h2 className="account-section-title">Authorized Apps</h2>
        <p className="account-section-desc">
          Third-party applications you have granted access to your account
        </p>
      </div>
      <div className="account-section-body">
        {isLoading && (
          <>
            <div className="account-skeleton-row" style={{ width: '55%', height: '16px' }} />
            <div className="account-skeleton-row" style={{ width: '70%', height: '16px' }} />
          </>
        )}
        {isError && (
          <p style={{ fontSize: '13px', color: '#dc2626', margin: 0 }}>
            Failed to load authorized apps. Please refresh.
          </p>
        )}
        {!isLoading && !isError && grants.length === 0 && (
          <div className="account-empty">
            <div className="account-empty-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
              </svg>
            </div>
            <p className="account-empty-title">No authorized apps</p>
            <p className="account-empty-desc">
              Apps you authorize with your account will appear here.
              You can revoke access at any time.
            </p>
          </div>
        )}
        {!isLoading && !isError && grants.length > 0 && (
          grants.map((grant) => (
            <GrantRow key={grant.consentId} grant={grant} onRevoked={() => {}} />
          ))
        )}
      </div>
    </section>
  );
}
