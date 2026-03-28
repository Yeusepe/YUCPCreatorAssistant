import { PolarEmbedCheckout } from '@polar-sh/checkout/embed';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccountInlineError, AccountModal } from '@/components/account/AccountPage';
import { DashboardAuthRequiredState } from '@/components/dashboard/AuthRequiredState';
import { DashboardCertificatesSkeleton } from '@/components/dashboard/DashboardSkeletons';
import { useToast } from '@/components/ui/Toast';
import { useActiveDashboardContext } from '@/hooks/useActiveDashboardContext';
import { isDashboardAuthError, useDashboardSession } from '@/hooks/useDashboardSession';
import {
  type CreatorCertificateDevice,
  type CreatorCertificatePlan,
  createCreatorCertificateCheckout,
  formatCertificateDate,
  getCreatorCertificatePortal,
  listCreatorCertificates,
  reconcileCreatorCertificateBilling,
  revokeCreatorCertificate,
} from '@/lib/certificates';

interface DashboardCertificatesSearch {
  plan?: string;
  checkout?: string;
  portal?: string;
  source?: string;
}

function DashboardCertificatesPending() {
  return (
    <div id="tab-panel-certificates" className="dashboard-tab-panel is-active" role="tabpanel">
      <div className="bento-grid">
        <DashboardCertificatesSkeleton />
      </div>
    </div>
  );
}

export const Route = createFileRoute('/_authenticated/dashboard/certificates')({
  validateSearch: (search: Record<string, unknown>): DashboardCertificatesSearch => ({
    plan: typeof search.plan === 'string' ? search.plan : undefined,
    checkout: typeof search.checkout === 'string' ? search.checkout : undefined,
    portal: typeof search.portal === 'string' ? search.portal : undefined,
    source: typeof search.source === 'string' ? search.source : undefined,
  }),
  pendingComponent: DashboardCertificatesPending,
  component: DashboardCertificates,
});

function formatQuota(value: number | null) {
  return value === null ? 'Unlimited' : value.toLocaleString();
}

function formatMeterUnits(value: number) {
  return value.toLocaleString();
}

/* Plan Card */

function PlanCard({
  plan,
  isCurrentPlan,
  isPending,
  onCheckout,
}: Readonly<{
  plan: CreatorCertificatePlan;
  isCurrentPlan: boolean;
  isPending: boolean;
  onCheckout: (plan: CreatorCertificatePlan) => void;
}>) {
  const highlights =
    plan.highlights.length > 0
      ? plan.highlights
      : [
          `${plan.deviceCap} signing machine${plan.deviceCap !== 1 ? 's' : ''}`,
          `${formatQuota(plan.signQuotaPerPeriod)} signatures per period`,
          `${plan.auditRetentionDays}-day audit log retention`,
          `${plan.supportTier === 'premium' ? 'Premium' : 'Standard'} support`,
          ...plan.meteredPrices.map((price) => `${price.meterName} usage billing`),
        ];

  return (
    <article className={`account-plan-card ${isCurrentPlan ? 'is-current' : ''}`}>
      <div className="account-plan-title-row">
        <div>
          <h3 className="account-plan-name">{plan.displayName}</h3>
          {plan.displayBadge && <p className="account-plan-meta">{plan.displayBadge}</p>}
          {plan.description && <p className="account-plan-meta">{plan.description}</p>}
        </div>
        {isCurrentPlan && <span className="account-badge account-badge--connected">Active</span>}
      </div>

      {/* CSS ::before pseudo-element adds checkmarks — no inline SVG needed */}
      <ul className="account-plan-feature-list">
        {highlights.map((h) => (
          <li key={`${plan.planKey}-${h}`}>{h}</li>
        ))}
      </ul>

      <button
        type="button"
        className={`account-btn account-btn--${isCurrentPlan ? 'secondary' : 'primary'}${isPending ? ' btn-loading' : ''}`}
        style={{ width: '100%', justifyContent: 'center', borderRadius: '999px' }}
        onClick={() => onCheckout(plan)}
        disabled={isPending || isCurrentPlan}
      >
        {isPending ? (
          <span className="btn-loading-spinner" aria-hidden="true" />
        ) : isCurrentPlan ? (
          'Current Plan'
        ) : (
          <>
            <img src="/Icons/Polar.svg" alt="" aria-hidden="true" className="cert-polar-btn-icon" />
            Subscribe via Polar
          </>
        )}
      </button>
    </article>
  );
}

/* Device Row */

function CertificateDeviceRow({
  device,
  isRevoking,
  onRevoke,
}: Readonly<{
  device: CreatorCertificateDevice;
  isRevoking: boolean;
  onRevoke: (certNonce: string) => void;
}>) {
  const [confirming, setConfirming] = useState(false);
  const isActive = device.status === 'active';

  return (
    <div className="account-list-row">
      <div
        className="account-list-row-icon"
        style={{ background: isActive ? 'rgba(34,197,94,0.1)' : 'rgba(148,163,184,0.1)' }}
      >
        <img
          src="/Icons/Laptop.png"
          alt=""
          aria-hidden="true"
          style={{ opacity: isActive ? 1 : 0.4 }}
        />
      </div>

      <div className="account-list-row-info">
        <p className="account-list-row-name">{device.publisherName}</p>
        <div className="account-list-row-meta">
          <span className="account-reference-chip">{device.devPublicKey.slice(0, 20)}…</span>
          <span className={`account-badge account-badge--${isActive ? 'active' : 'revoked'}`}>
            {device.status}
          </span>
          <span>Issued {formatCertificateDate(device.issuedAt)}</span>
          <span aria-hidden="true">·</span>
          <span>Expires {formatCertificateDate(device.expiresAt)}</span>
        </div>
      </div>

      <div className="account-list-row-actions">
        {isActive && (
          <button
            type="button"
            className="account-btn account-btn--danger"
            style={{ borderRadius: '8px', fontSize: '12px', padding: '5px 12px' }}
            onClick={() => setConfirming(true)}
          >
            Revoke
          </button>
        )}
      </div>

      {confirming && (
        <AccountModal
          title="Revoke Device"
          onClose={() => {
            if (!isRevoking) setConfirming(false);
          }}
        >
          <p className="account-modal-body">
            You are about to revoke <strong>{device.publisherName}</strong>. This takes effect
            immediately and invalidates its signing certificate.
          </p>
          <div className="account-modal-actions">
            <button
              type="button"
              className="account-btn account-btn--secondary"
              onClick={() => setConfirming(false)}
              disabled={isRevoking}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`account-btn account-btn--danger${isRevoking ? ' btn-loading' : ''}`}
              onClick={() => onRevoke(device.certNonce)}
              disabled={isRevoking}
            >
              {isRevoking ? (
                <span className="btn-loading-spinner" aria-hidden="true" />
              ) : (
                'Confirm Revocation'
              )}
            </button>
          </div>
        </AccountModal>
      )}
    </div>
  );
}

/* Page */

export default function DashboardCertificates() {
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const toast = useToast();
  const autoLaunchRef = useRef<string | null>(null);
  const embedCheckoutRef = useRef<PolarEmbedCheckout | null>(null);

  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [confirmedProductId, setConfirmedProductId] = useState<string | null>(null);
  const [pendingCertNonce, setPendingCertNonce] = useState<string | null>(null);

  const { isPersonalDashboard } = useActiveDashboardContext();
  const { canRunPanelQueries, isAuthResolved, markSessionExpired, status } = useDashboardSession();

  const certificatesQuery = useQuery({
    queryKey: ['creator-certificates'],
    queryFn: listCreatorCertificates,
    enabled: canRunPanelQueries,
  });

  useEffect(() => {
    if (isDashboardAuthError(certificatesQuery.error)) markSessionExpired();
  }, [certificatesQuery.error, markSessionExpired]);

  useEffect(() => {
    return () => {
      embedCheckoutRef.current?.close();
      embedCheckoutRef.current = null;
    };
  }, []);

  const checkoutMut = useMutation({
    mutationFn: (plan: CreatorCertificatePlan) =>
      createCreatorCertificateCheckout({
        productId: plan.productId,
        planKey: plan.planKey,
      }),
    onSuccess: async (result) => {
      try {
        const theme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        const checkout = await PolarEmbedCheckout.create(result.url, { theme });
        embedCheckoutRef.current = checkout;

        checkout.addEventListener(
          'confirmed',
          () => {
            setConfirmedProductId(result.productId);
          },
          { once: true }
        );

        checkout.addEventListener(
          'close',
          () => {
            if (embedCheckoutRef.current === checkout) {
              embedCheckoutRef.current = null;
            }
            setPendingProductId(null);
            setConfirmedProductId(null);
          },
          { once: true }
        );

        checkout.addEventListener(
          'success',
          () => {
            void (async () => {
              try {
                const refreshed = await reconcileCreatorCertificateBilling();
                queryClient.setQueryData(['creator-certificates'], refreshed.overview);
                await queryClient.invalidateQueries({ queryKey: ['creator-certificates'] });
                toast.success('Billing updated');
              } catch (error) {
                if (isDashboardAuthError(error)) {
                  markSessionExpired();
                  return;
                }
                toast.error('Billing updated, but refresh is still pending', {
                  description: 'Your access should appear after the next webhook sync.',
                });
              } finally {
                checkout.close();
                if (embedCheckoutRef.current === checkout) {
                  embedCheckoutRef.current = null;
                }
                setPendingProductId(null);
                setConfirmedProductId(null);
              }
            })();
          },
          { once: true }
        );
      } catch {
        window.location.href = result.url;
        setPendingProductId(null);
        setConfirmedProductId(null);
      }
    },
    onError: (error) => {
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      toast.error('Could not start checkout', { description: 'Please try again.' });
      setPendingProductId(null);
      setConfirmedProductId(null);
    },
  });

  const portalMut = useMutation({
    mutationFn: () => getCreatorCertificatePortal(),
    onSuccess: (result) => {
      window.location.href = result.url;
    },
    onError: (error) => {
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      toast.error('Could not open billing portal', {
        description: 'Session expired or portal unavailable.',
      });
    },
  });

  const revokeMut = useMutation({
    mutationFn: (certNonce: string) => revokeCreatorCertificate(certNonce),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['creator-certificates'] });
      toast.success('Device revoked');
    },
    onError: (error) => {
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      toast.error('Could not revoke device', { description: 'Contact support if this persists.' });
    },
    onSettled: () => setPendingCertNonce(null),
  });

  const overview = certificatesQuery.data;
  const billing = overview?.billing;
  const currentPlan = useMemo(
    () =>
      overview?.availablePlans.find(
        (p) =>
          p.productId === overview.billing.productId ||
          p.productId === overview.billing.planKey ||
          p.planKey === overview.billing.planKey
      ) ?? null,
    [overview]
  );

  const isLoading = !isAuthResolved || (canRunPanelQueries && certificatesQuery.isLoading);
  const hasAuthError = isDashboardAuthError(certificatesQuery.error);
  const hasActiveSubscription = billing?.status === 'active';

  useEffect(() => {
    if (!overview || certificatesQuery.isLoading) return;
    if (search.checkout === '1' && search.plan) {
      const target =
        overview.availablePlans.find(
          (p) => p.productId === search.plan || p.planKey === search.plan
        ) ?? null;
      if (target && autoLaunchRef.current !== `checkout:${target.productId}`) {
        autoLaunchRef.current = `checkout:${target.productId}`;
        setPendingProductId(target.productId);
        checkoutMut.mutate(target);
      }
      return;
    }
    if (search.portal === '1' && autoLaunchRef.current !== 'portal') {
      autoLaunchRef.current = 'portal';
      portalMut.mutate();
    }
  }, [
    certificatesQuery.isLoading,
    overview,
    search.checkout,
    search.plan,
    search.portal,
    checkoutMut,
    portalMut,
  ]);

  const handleCheckout = (plan: CreatorCertificatePlan) => {
    setPendingProductId(plan.productId);
    checkoutMut.mutate(plan);
  };

  const handleRevoke = (certNonce: string) => {
    setPendingCertNonce(certNonce);
    revokeMut.mutate(certNonce);
  };

  /* Guards */

  if (status === 'signed_out' || status === 'expired') {
    return (
      <div id="tab-panel-certificates" className="dashboard-tab-panel is-active" role="tabpanel">
        <DashboardAuthRequiredState
          id="cert-auth"
          title="Sign in to manage certificates"
          description="Your session expired. Connect to access billing and devices."
        />
      </div>
    );
  }

  if (!isPersonalDashboard) {
    return (
      <div id="tab-panel-certificates" className="dashboard-tab-panel is-active" role="tabpanel">
        <div className="bento-grid">
          <section className="intg-card animate-in bento-col-12">
            <div className="intg-header">
              <div className="intg-icon">
                <img
                  src="/Icons/Shield.png"
                  alt=""
                  aria-hidden="true"
                  style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                />
              </div>
              <div className="intg-copy" style={{ flex: 1 }}>
                <h1 className="intg-title">Creator scope required</h1>
                <p className="intg-desc">
                  Certificates are tied to your base creator identity. Return to your root dashboard
                  to manage them.
                </p>
              </div>
            </div>
            <Link
              to="/dashboard/certificates"
              search={(prev) => ({ ...prev, guild_id: undefined, tenant_id: undefined })}
              className="account-btn account-btn--primary"
              style={{ borderRadius: '999px', alignSelf: 'flex-start' }}
            >
              Switch to creator dashboard
            </Link>
          </section>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div id="tab-panel-certificates" className="dashboard-tab-panel is-active" role="tabpanel">
        <div className="bento-grid">
          <DashboardCertificatesSkeleton />
        </div>
      </div>
    );
  }

  /* Main */

  return (
    <div id="tab-panel-certificates" className="dashboard-tab-panel is-active" role="tabpanel">
      <div className="bento-grid">
        {certificatesQuery.isError && !hasAuthError && (
          <div className="bento-col-12">
            <AccountInlineError message="Failed to load certificate workspace. Please refresh." />
          </div>
        )}

        {/* Active subscription: stat row + device list + billing sidebar + plans */}
        {hasActiveSubscription && (
          <>
            {/* Devices card */}
            <section className="intg-card animate-in bento-col-8">
              <div className="intg-header">
                <div className="intg-icon">
                  <img
                    src="/Icons/Laptop.png"
                    alt=""
                    aria-hidden="true"
                    style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                  />
                </div>
                <div className="intg-copy">
                  <h2 className="intg-title">Authorized Machines</h2>
                  <p className="intg-desc">
                    Each enrolled machine holds a unique signing certificate. Revoking it takes
                    effect immediately.
                  </p>
                </div>
              </div>

              {/* Quick-glance stat row */}
              <div className="cert-stat-row">
                <div className="cert-stat-item">
                  <span className="cert-stat-label">Devices</span>
                  <span className="cert-stat-value">
                    {billing.activeDeviceCount}&thinsp;/&thinsp;{billing.deviceCap ?? '∞'}
                  </span>
                </div>
                <div className="cert-stat-item">
                  <span className="cert-stat-label">Enrollment</span>
                  <span className="cert-stat-value">
                    {billing.allowEnrollment ? 'Open' : 'Closed'}
                  </span>
                </div>
                <div className="cert-stat-item">
                  <span className="cert-stat-label">Signing</span>
                  <span className="cert-stat-value">
                    {billing.allowSigning ? 'Active' : 'Paused'}
                  </span>
                </div>
              </div>

              <div className="account-list">
                {overview?.devices && overview.devices.length > 0 ? (
                  overview.devices.map((device) => (
                    <CertificateDeviceRow
                      key={device.certNonce}
                      device={device}
                      isRevoking={pendingCertNonce === device.certNonce && revokeMut.isPending}
                      onRevoke={handleRevoke}
                    />
                  ))
                ) : (
                  <div className="account-empty">
                    <div className="account-empty-icon">
                      <img
                        src="/Icons/Laptop.png"
                        alt=""
                        aria-hidden="true"
                        style={{
                          width: '20px',
                          height: '20px',
                          objectFit: 'contain',
                          opacity: 0.45,
                        }}
                      />
                    </div>
                    <p className="account-empty-title">No devices enrolled yet</p>
                    <p className="account-empty-desc">
                      Authorize a machine via the CLI or Unity plugin and it will appear here.
                    </p>
                  </div>
                )}
              </div>
            </section>

            {/* Subscription / billing sidebar */}
            <section className="intg-card animate-in animate-in-delay-1 bento-col-4">
              <div className="intg-header">
                <div className="intg-icon">
                  <img
                    src="/Icons/Shield.png"
                    alt=""
                    aria-hidden="true"
                    style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                  />
                </div>
                <div className="intg-copy">
                  <h2 className="intg-title">{currentPlan?.displayName ?? 'Subscription'}</h2>
                  <p className="intg-desc">
                    <span
                      className={`account-badge account-badge--${billing.status === 'active' ? 'active' : 'warning'}`}
                    >
                      Active plan
                    </span>
                  </p>
                </div>
              </div>

              <div>
                <dl className="account-kv-list">
                  <div className="account-kv-row">
                    <dt className="account-kv-label">Enrollment</dt>
                    <dd className="account-kv-value">
                      {billing.allowEnrollment ? 'Open' : 'Closed'}
                    </dd>
                  </div>
                  <div className="account-kv-row">
                    <dt className="account-kv-label">Signing</dt>
                    <dd className="account-kv-value">
                      {billing.allowSigning ? 'Enabled' : 'Restricted'}
                    </dd>
                  </div>
                  {billing.signQuotaPerPeriod !== null && (
                    <div className="account-kv-row">
                      <dt className="account-kv-label">Quota</dt>
                      <dd className="account-kv-value">
                        {billing.signQuotaPerPeriod.toLocaleString()}
                      </dd>
                    </div>
                  )}
                  {billing.currentPeriodEnd && (
                    <div className="account-kv-row">
                      <dt className="account-kv-label">Renews</dt>
                      <dd className="account-kv-value">
                        {formatCertificateDate(billing.currentPeriodEnd)}
                      </dd>
                    </div>
                  )}
                  {(overview?.meters ?? []).map((meter) => (
                    <div key={meter.meterId} className="account-kv-row">
                      <dt className="account-kv-label">{meter.meterName ?? meter.meterId}</dt>
                      <dd className="account-kv-value">
                        {formatMeterUnits(meter.consumedUnits)}
                        {meter.balance > 0
                          ? ` used, ${formatMeterUnits(meter.balance)} remaining`
                          : ' used'}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '14px',
                    borderTop: '1px solid rgba(148,163,184,0.15)',
                  }}
                >
                  <button
                    type="button"
                    className={`account-btn account-btn--secondary${portalMut.isPending ? ' btn-loading' : ''}`}
                    style={{ width: '100%', justifyContent: 'center', borderRadius: '999px' }}
                    onClick={() => portalMut.mutate()}
                    disabled={portalMut.isPending}
                  >
                    {portalMut.isPending ? (
                      <span className="btn-loading-spinner" aria-hidden="true" />
                    ) : (
                      <img
                        src="/Icons/Polar.svg"
                        alt=""
                        aria-hidden="true"
                        className="cert-polar-btn-icon"
                      />
                    )}
                    {portalMut.isPending ? 'Opening...' : 'Manage Billing'}
                  </button>
                </div>
              </div>
            </section>

            {overview && overview.availablePlans.length > 0 && (
              <section className="intg-card animate-in animate-in-delay-2 bento-col-12">
                <div className="intg-header">
                  <div className="intg-icon">
                    <img
                      src="/Icons/BagPlus.png"
                      alt=""
                      aria-hidden="true"
                      style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                    />
                  </div>
                  <div className="intg-copy">
                    <h2 className="intg-title">Available Plans</h2>
                    <p className="intg-desc">
                      Upgrade or change your plan. Changes apply immediately via Polar checkout.
                    </p>
                  </div>
                  <span className="account-polar-badge">
                    <img src="/Icons/Polar.svg" alt="" aria-hidden="true" />
                    Polar
                  </span>
                </div>

                <div className="account-plan-grid">
                  {overview.availablePlans.map((plan) => (
                    <PlanCard
                      key={plan.planKey}
                      plan={plan}
                      isCurrentPlan={
                        billing?.productId === plan.productId ||
                        (billing?.planKey === plan.planKey && billing.status === 'active')
                      }
                      isPending={
                        (pendingProductId === plan.productId ||
                          confirmedProductId === plan.productId) &&
                        (checkoutMut.isPending || embedCheckoutRef.current !== null)
                      }
                      onCheckout={handleCheckout}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* No subscription: feature overview + upgrade sidebar + plans */}
        {!hasActiveSubscription && (
          <>
            {/* Feature overview card */}
            <section className="intg-card animate-in bento-col-8">
              <div className="intg-header">
                <div className="intg-icon">
                  <img
                    src="/Icons/Shield.png"
                    alt=""
                    aria-hidden="true"
                    style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                  />
                </div>
                <div className="intg-copy">
                  <h2 className="intg-title">Code Signing Certificates</h2>
                  <p className="intg-desc">
                    Cryptographically bind your packages to your creator identity.
                  </p>
                </div>
              </div>

              <div className="cert-features-grid">
                {(
                  [
                    {
                      icon: '/Icons/Shield.png',
                      colorClass: 'cert-feature-icon--blue',
                      title: 'Verified identity',
                      desc: 'Packages are signed with a certificate tied to your creator profile.',
                    },
                    {
                      icon: '/Icons/Laptop.png',
                      colorClass: 'cert-feature-icon--green',
                      title: 'Multi-device signing',
                      desc: 'Authorize multiple publishing machines under one account.',
                    },
                    {
                      icon: '/Icons/Key.png',
                      colorClass: 'cert-feature-icon--amber',
                      title: 'Instant revocation',
                      desc: 'Remove any device in one click — effective immediately.',
                    },
                    {
                      icon: '/Icons/Wrench.png',
                      colorClass: 'cert-feature-icon--purple',
                      title: 'Audit log',
                      desc: 'Full history of certificate issuance and signing events.',
                    },
                  ] as const
                ).map(({ icon, colorClass, title, desc }) => (
                  <div key={title} className="cert-feature-item">
                    <div className={`cert-feature-icon ${colorClass}`}>
                      <img src={icon} alt="" aria-hidden="true" />
                    </div>
                    <div className="cert-feature-copy">
                      <p className="cert-feature-title">{title}</p>
                      <p className="cert-feature-desc">{desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Upgrade CTA sidebar */}
            <section className="intg-card animate-in animate-in-delay-1 bento-col-4">
              <div className="intg-header">
                <div className="intg-icon">
                  <img
                    src="/Icons/BagPlus.png"
                    alt=""
                    aria-hidden="true"
                    style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                  />
                </div>
                <div className="intg-copy">
                  <h2 className="intg-title">Get Started</h2>
                  <p className="intg-desc">Choose a plan below to unlock signing.</p>
                </div>
              </div>

              <div>
                <dl className="account-kv-list">
                  <div className="account-kv-row">
                    <dt className="account-kv-label">Status</dt>
                    <dd>
                      <span className="account-badge account-badge--provider">Inactive</span>
                    </dd>
                  </div>
                  <div className="account-kv-row">
                    <dt className="account-kv-label">Devices</dt>
                    <dd className="account-kv-value">0 enrolled</dd>
                  </div>
                  <div className="account-kv-row">
                    <dt className="account-kv-label">Signing</dt>
                    <dd className="account-kv-value">Not available</dd>
                  </div>
                </dl>

                <div
                  style={{
                    marginTop: '16px',
                    paddingTop: '14px',
                    borderTop: '1px solid rgba(148,163,184,0.15)',
                  }}
                >
                  <span className="account-polar-badge">
                    <img src="/Icons/Polar.svg" alt="" aria-hidden="true" />
                    Billing managed by Polar
                  </span>
                </div>
              </div>
            </section>

            {overview && overview.availablePlans.length > 0 && (
              <section className="intg-card animate-in animate-in-delay-2 bento-col-12">
                <div className="intg-header">
                  <div className="intg-icon">
                    <img
                      src="/Icons/BagPlus.png"
                      alt=""
                      aria-hidden="true"
                      style={{ width: '22px', height: '22px', objectFit: 'contain' }}
                    />
                  </div>
                  <div className="intg-copy">
                    <h2 className="intg-title">Choose a Plan</h2>
                    <p className="intg-desc">
                      Subscribe to unlock certificate signing. Checkout stays embedded in the
                      dashboard and billing remains managed by Polar.
                    </p>
                  </div>
                  <span className="account-polar-badge">
                    <img src="/Icons/Polar.svg" alt="" aria-hidden="true" />
                    Polar
                  </span>
                </div>

                <div className="account-plan-grid">
                  {overview.availablePlans.map((plan) => (
                    <PlanCard
                      key={plan.planKey}
                      plan={plan}
                      isCurrentPlan={false}
                      isPending={
                        (pendingProductId === plan.productId ||
                          confirmedProductId === plan.productId) &&
                        (checkoutMut.isPending || embedCheckoutRef.current !== null)
                      }
                      onCheckout={handleCheckout}
                    />
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
