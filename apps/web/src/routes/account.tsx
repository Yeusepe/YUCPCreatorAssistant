import { createFileRoute, Link, Outlet, redirect, useRouterState } from '@tanstack/react-router';
import { BackgroundCanvasRoot } from '@/components/page/BackgroundCanvasRoot';
import { useAccountShell } from '@/hooks/useAccountShell';
import { dashboardShellQueryOptions } from '@/lib/dashboardQueryOptions';
import { fetchDashboardShell } from '@/lib/server/dashboard';
import '@/styles/account.css';

export const Route = createFileRoute('/account')({
  beforeLoad: ({ context, location }) => {
    if (!context.isAuthenticated) {
      throw redirect({
        to: '/sign-in',
        search: { redirectTo: location.href },
      });
    }
  },
  loader: async ({ context: { queryClient } }) => {
    return queryClient.ensureQueryData(
      dashboardShellQueryOptions({
        queryKey: ['dashboard-shell'],
        queryFn: () => fetchDashboardShell(),
      })
    );
  },
  component: AccountLayout,
});

const NAV_ITEMS = [
  {
    to: '/account' as const,
    label: 'Profile',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    ),
  },
  {
    to: '/account/licenses' as const,
    label: 'My Licenses',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 9h6M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    to: '/account/authorized-apps' as const,
    label: 'Authorized Apps',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3 7h7l-5.5 4 2 7L12 16l-6.5 4 2-7L2 9h7z" />
      </svg>
    ),
  },
  {
    to: '/account/privacy' as const,
    label: 'Privacy & Data',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
    ),
  },
];

function AccountLayout() {
  const { guilds } = useAccountShell();
  const routerState = useRouterState();
  const currentPath = routerState.location.pathname;

  const isCreator = guilds.length > 0;

  return (
    <div className="account-page">
      <BackgroundCanvasRoot />

      <header className="account-topbar">
        <div className="account-topbar-logo">
          <img src="/Icons/Bag.png" alt="Creator Assistant" width="28" height="28" />
        </div>
        <span className="account-topbar-title">My Account</span>
        <div className="account-topbar-actions">
          {isCreator && (
            <Link to="/dashboard" className="account-topbar-link">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
              Creator Dashboard
            </Link>
          )}
        </div>
      </header>

      <div className="account-body">
        <nav className="account-nav" aria-label="Account navigation">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.to === '/account'
                ? currentPath === '/account' || currentPath === '/account/'
                : currentPath.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`account-nav-item${isActive ? ' is-active' : ''}`}
              >
                <span className="account-nav-icon">{item.icon}</span>
                {item.label}
              </Link>
            );
          })}
          <div className="account-nav-divider" />
        </nav>

        <main className="account-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
