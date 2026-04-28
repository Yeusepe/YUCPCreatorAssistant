import { useQuery } from '@tanstack/react-query';
import { createFileRoute, Link } from '@tanstack/react-router';
import { ChevronDown, ChevronUp, ExternalLink, Package, ShieldCheck, Store } from 'lucide-react';
import type { PropsWithChildren } from 'react';
import { useEffect, useState } from 'react';
import { CloudBackground } from '@/components/three/CloudBackground';
import { useToast } from '@/components/ui/Toast';
import { usePublicAuth } from '@/hooks/usePublicAuth';
import { requestBackstageRepoAccess } from '@/lib/packages';
import { createBuyerProductAccessVerificationIntent } from '@/lib/productAccess';
import { routeStyleHrefs, routeStylesheetLinks } from '@/lib/routeStyles';
import { fetchBuyerProductAccess } from '@/lib/server/productAccess';

export const Route = createFileRoute('/access/$catalogProductId')({
  validateSearch: (search: Record<string, unknown>) => ({
    intent_id: typeof search.intent_id === 'string' ? search.intent_id : undefined,
    grant: typeof search.grant === 'string' ? search.grant : undefined,
  }),
  head: () => ({
    meta: [{ title: 'Product Access | YUCP' }],
    links: routeStylesheetLinks(routeStyleHrefs.verifyPurchase),
  }),
  pendingComponent: BuyerProductAccessPending,
  errorComponent: BuyerProductAccessError,
  loader: async ({ params }) =>
    fetchBuyerProductAccess({
      data: {
        catalogProductId: params.catalogProductId,
      },
    }),
  component: BuyerProductAccessPage,
});

function PageShell({
  children,
  isVisible = true,
}: PropsWithChildren<{
  isVisible?: boolean;
}>) {
  return (
    <div className="vp-page">
      <CloudBackground variant="default" />
      <div className="vp-wrapper">
        <main className={`vp-main vp-main--buyer-access${isVisible ? ' is-visible' : ''}`}>
          {children}
        </main>
      </div>
    </div>
  );
}

function ProductPreview({
  packageId,
  displayName,
  latestPublishedVersion,
}: Readonly<{
  packageId: string;
  displayName: string | null;
  latestPublishedVersion: string | null;
}>) {
  return (
    <div className="vp-method-row">
      <div className="vp-method-row-info">
        <div className="vp-method-provider">
          <Package className="size-4 text-white/65" />
          <span className="vp-provider-label-text">Included package</span>
        </div>
        <p className="vp-method-title">{displayName ?? packageId}</p>
        <p className="vp-method-desc break-all font-mono">{packageId}</p>
      </div>
      <div className="vp-method-row-action">
        <span className="vp-status-badge vp-status-badge--none">
          {latestPublishedVersion ? `v${latestPublishedVersion}` : 'Pending'}
        </span>
      </div>
    </div>
  );
}

function JourneyStep({
  step,
  title,
  description,
}: Readonly<{
  step: string;
  title: string;
  description: string;
}>) {
  return (
    <div className="vp-method-row">
      <div className="vp-method-row-info">
        <div className="vp-method-provider">
          <span className="vp-provider-label-text">{step}</span>
        </div>
        <p className="vp-method-title">{title}</p>
        <p className="vp-method-desc">{description}</p>
      </div>
    </div>
  );
}

function BuyerProductAccessPage() {
  const { catalogProductId } = Route.useParams();
  const search = Route.useSearch();
  const accessData = Route.useLoaderData();
  const toast = useToast();
  const { isAuthenticated, isPending: isAuthPending, signIn } = usePublicAuth();
  const [isVisible, setIsVisible] = useState(false);
  const [isStartingVerification, setIsStartingVerification] = useState(false);
  const [isManualSetupOpen, setIsManualSetupOpen] = useState(false);

  useEffect(() => {
    setIsVisible(true);
  }, []);

  useEffect(() => {
    if (!search.grant || typeof window === 'undefined') {
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.delete('grant');
    window.history.replaceState({}, '', url.toString());
  }, [search.grant]);

  const repoAccessQuery = useQuery({
    queryKey: ['buyer-backstage-repo-access', catalogProductId],
    queryFn: requestBackstageRepoAccess,
    enabled:
      isAuthenticated &&
      accessData.accessState.hasActiveEntitlement === true &&
      accessData.accessState.hasPublishedPackages,
    retry: false,
  });

  useEffect(() => {
    if (!repoAccessQuery.data?.repositoryUrl) {
      setIsManualSetupOpen(false);
    }
  }, [repoAccessQuery.data?.repositoryUrl]);

  async function handleCopyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(label);
    } catch {
      toast.error('Could not copy', {
        description: 'Please copy the value manually.',
      });
    }
  }

  const { product, accessState } = accessData;
  const hasAccess = accessState.hasActiveEntitlement;
  const packageCount = product.packagePreview.length;
  const packageCountLabel = `${packageCount} Unity package${packageCount === 1 ? '' : 's'}`;
  const heroCopy = hasAccess
    ? 'This buyer account is already entitled. Add the repo in VCC, then continue in Unity.'
    : isAuthenticated
      ? 'You are signed in. Continue to the same purchase verification screen used by the OAuth flow to verify the store account or license you purchased with.'
      : 'Sign in with the YUCP Discord account that should own this purchase in VCC, then continue to purchase verification.';
  const flowNote = hasAccess
    ? 'The repo handoff is being prepared for this entitled buyer account.'
    : isAuthenticated
      ? 'Verification happens on the hosted purchase verification page. When it succeeds, you come back here ready for VCC.'
      : 'Your YUCP account becomes the home for this purchase. Keep using the same account in VCC.';

  return (
    <PageShell isVisible={isVisible}>
      <div className="vp-card fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="vp-card-header">
          <p className="vp-eyebrow">Buyer access</p>
          <h1 className="vp-package-name">{product.displayName}</h1>
          <p className="vp-card-subtitle">{heroCopy}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
              <Store className="size-3.5" />
              Bought on {product.providerLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
              <Package className="size-3.5" />
              {packageCountLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/70">
              <ShieldCheck className="size-3.5" />
              Private per account
            </span>
          </div>

          {search.intent_id ? (
            <div className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
              Purchase confirmed. Continue with VCC below.
            </div>
          ) : null}

          {!accessState.hasPublishedPackages ? (
            <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              This product is linked, but the creator has not published a package yet.
            </div>
          ) : null}
        </div>

        {hasAccess ? (
          <div className="vp-checking-section">
            {repoAccessQuery.isLoading ? (
              <>
                <span className="vp-spinner vp-spinner--lg" aria-hidden="true" />
                <p className="vp-loading-text">Preparing your VCC access...</p>
              </>
            ) : (
              <button
                type="button"
                className="vp-primary-btn disabled:pointer-events-none disabled:opacity-60"
                disabled={!repoAccessQuery.data?.addRepoUrl}
                onClick={() => {
                  if (repoAccessQuery.data?.addRepoUrl) {
                    window.location.href = repoAccessQuery.data.addRepoUrl;
                  }
                }}
              >
                Add to VCC
              </button>
            )}

            <p className="vp-section-desc mb-0 max-w-[32rem] text-center">{flowNote}</p>

            {repoAccessQuery.isError ? (
              <p className="vp-method-error">
                We could not prepare your repo handoff. Refresh and try again.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="vp-oauth-section">
            <p className="vp-section-eyebrow">Buyer verification</p>
            <p className="vp-section-desc">{flowNote}</p>
            <div className="vp-oauth-buttons">
              <div className="vp-oauth-row vp-oauth-row--enter">
                <div className="vp-oauth-row-left">
                  <div className="vp-oauth-row-text">
                    <span className="vp-oauth-label">Discord sign-in</span>
                    <span className="vp-oauth-account">
                      {isAuthenticated
                        ? 'Signed in. Continue to purchase verification.'
                        : 'Sign in with the buyer account you will use in VCC.'}
                    </span>
                  </div>
                </div>
                <div className="vp-oauth-row-right">
                  <button
                    type="button"
                    className={`vp-oauth-verify-btn${isStartingVerification ? ' btn-loading' : ''}`}
                    disabled={
                      !accessState.hasPublishedPackages || isAuthPending || isStartingVerification
                    }
                    onClick={async () => {
                      if (!isAuthenticated) {
                        await signIn(window.location.href);
                        return;
                      }

                      try {
                        setIsStartingVerification(true);
                        const response = await createBuyerProductAccessVerificationIntent(
                          catalogProductId,
                          {
                            returnTo: product.accessPagePath,
                          }
                        );
                        window.location.href = response.verificationUrl;
                      } catch {
                        toast.error('Could not start verification', {
                          description: 'Please refresh and try again.',
                        });
                        setIsStartingVerification(false);
                      }
                    }}
                  >
                    {isStartingVerification ? (
                      <>
                        <span className="btn-loading-spinner" aria-hidden="true" />
                        Starting verification...
                      </>
                    ) : isAuthenticated ? (
                      'Verify purchase'
                    ) : (
                      'Sign in to continue'
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {hasAccess ? (
          <>
            <div className="vp-methods-divider">
              <span className="vp-methods-divider-label">Manual setup</span>
            </div>
            <section className="vp-section">
              <div className="vp-method-row">
                <div className="vp-method-row-info">
                  <p className="vp-method-title">Need the repo URL instead?</p>
                  <p className="vp-method-desc">
                    {repoAccessQuery.data?.repositoryUrl
                      ? 'Keep using Add to VCC for the normal flow. Only open manual setup if VCC does not launch or support asks for the repo URL.'
                      : 'Manual repo details appear after your private repo handoff is ready.'}
                  </p>
                </div>
                <div className="vp-method-row-action">
                  <button
                    type="button"
                    className="vp-action-btn"
                    disabled={!repoAccessQuery.data?.repositoryUrl}
                    onClick={() => setIsManualSetupOpen((current) => !current)}
                  >
                    {isManualSetupOpen ? (
                      <>
                        <ChevronUp className="size-4" />
                        Hide manual setup
                      </>
                    ) : (
                      <>
                        <ChevronDown className="size-4" />
                        Show manual setup
                      </>
                    )}
                  </button>
                </div>

                {isManualSetupOpen && repoAccessQuery.data?.repositoryUrl ? (
                  <div className="w-full rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="mb-3 text-sm leading-6 text-white/65">
                      In VCC, choose <strong>Add Repository</strong> and paste the entitled repo URL
                      below.
                    </p>
                    <p className="break-all rounded-xl border border-white/10 bg-black/20 px-3 py-3 font-mono text-xs text-white/80">
                      {repoAccessQuery.data.repositoryUrl}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="vp-action-btn"
                        onClick={() =>
                          handleCopyValue(
                            repoAccessQuery.data?.repositoryUrl ?? '',
                            'Repo URL copied'
                          )
                        }
                      >
                        Copy repo URL
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            </section>
          </>
        ) : (
          <div className="vp-card-footer">
            <p className="vp-footer-note">
              Manual repo setup stays hidden until this account has verified access.
            </p>
          </div>
        )}

        <div className="vp-methods-divider">
          <span className="vp-methods-divider-label">How this works</span>
        </div>

        <section className="vp-section">
          <JourneyStep
            step="Step 1"
            title="Use one YUCP account"
            description="Sign in with the same buyer account you want to use in VCC and keep that account consistent through the flow."
          />
          <JourneyStep
            step="Step 2"
            title="Verify on the purchase page"
            description={`Continue to the hosted purchase verification screen, where ${product.providerLabel} account checks and license entry happen.`}
          />
          <JourneyStep
            step="Step 3"
            title="Add your entitled repo"
            description="After verification succeeds, come back here and open the buyer-scoped repo in VCC."
          />
        </section>

        <div className="vp-methods-divider">
          <span className="vp-methods-divider-label">
            Included package{packageCount === 1 ? '' : 's'}
          </span>
        </div>

        <section className="vp-section">
          {product.packagePreview.map((packageLink) => (
            <ProductPreview
              key={packageLink.packageId}
              packageId={packageLink.packageId}
              displayName={packageLink.displayName}
              latestPublishedVersion={packageLink.latestPublishedVersion}
            />
          ))}
        </section>

        <div className="vp-card-footer">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link to="/account/licenses" className="vp-action-btn">
              Open verified purchases
            </Link>
            {product.storefrontUrl ? (
              <a
                href={product.storefrontUrl}
                target="_blank"
                rel="noreferrer"
                className="vp-action-btn"
              >
                <ExternalLink className="size-4" />
                Open store listing
              </a>
            ) : null}
          </div>
          <p className="vp-footer-note mt-4">
            The normal path is Discord sign-in, purchase verification, then Add to VCC. Manual repo
            setup is only there for troubleshooting.
          </p>
        </div>
      </div>
    </PageShell>
  );
}

function BuyerProductAccessPending() {
  return (
    <PageShell>
      <div className="vp-card fade-up" style={{ animationDelay: '0.1s' }}>
        <div className="vp-loading-state">
          <span className="vp-spinner vp-spinner--lg" aria-hidden="true" />
          <p className="vp-loading-text">Loading buyer access...</p>
        </div>
      </div>
    </PageShell>
  );
}

function BuyerProductAccessError() {
  return (
    <PageShell>
      <div className="vp-card vp-card--error fade-up" style={{ animationDelay: '0.1s' }}>
        <h1 className="vp-package-name">We could not load this product access page</h1>
        <p className="vp-card-subtitle">
          Open the link again from your store receipt or your library, then try once more.
        </p>
        <div className="mt-6 flex justify-center">
          <Link to="/account/licenses" className="vp-primary-btn">
            Open verified purchases
          </Link>
        </div>
      </div>
    </PageShell>
  );
}
