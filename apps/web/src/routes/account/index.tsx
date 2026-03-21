import { createFileRoute } from '@tanstack/react-router';
import { useAccountShell } from '@/hooks/useAccountShell';
import { useAuth } from '@/hooks/useAuth';

export const Route = createFileRoute('/account/')({
  component: AccountProfile,
});

function AccountProfile() {
  const { viewer, guilds } = useAccountShell();
  const { signOut } = useAuth();

  const isCreator = guilds.length > 0;

  return (
    <>
      <section className="account-section">
        <div className="account-section-header">
          <h2 className="account-section-title">Profile</h2>
          <p className="account-section-desc">Your account information from Discord</p>
        </div>
        <div className="account-section-body">
          <div className="account-profile-row">
            <div className="account-avatar" aria-hidden="true">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="12" cy="8" r="4" />
                <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
              </svg>
            </div>
            <div className="account-profile-info">
              <p className="account-profile-name">Your Account</p>
              <p className="account-profile-meta">
                ID: {viewer.authUserId.slice(0, 8)}&hellip;
              </p>
            </div>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text-muted, #888)', margin: '4px 0 0' }}>
            Profile details (name, avatar) are sourced from Discord and edited there.
          </p>
        </div>
      </section>

      {!isCreator && (
        <section className="account-section">
          <div className="account-section-header">
            <h2 className="account-section-title">Start using Creator Dashboard</h2>
            <p className="account-section-desc">
              Manage purchase verification for your Discord community
            </p>
          </div>
          <div className="account-section-body">
            <div className="account-creator-card">
              <div className="account-creator-card-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
              </div>
              <div className="account-creator-card-body">
                <h3 className="account-creator-card-title">Add bot to a server</h3>
                <p className="account-creator-card-desc">
                  Invite the bot to your Discord server to unlock the creator dashboard.
                  Connect storefronts, automate purchase verification, and manage roles.
                </p>
                <button
                  type="button"
                  className="account-btn account-btn--primary"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      window.location.assign(
                        `/api/install/bot?authUserId=${encodeURIComponent(viewer.authUserId)}`
                      );
                    }
                  }}
                >
                  Add bot to a server
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      <section className="account-section">
        <div className="account-section-header">
          <h2 className="account-section-title">Session</h2>
        </div>
        <div className="account-section-body">
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '13px', color: 'inherit', margin: 0 }}>
                Signed in via Discord
              </p>
            </div>
            <button
              type="button"
              className="account-btn account-btn--secondary"
              onClick={() => signOut()}
            >
              Sign out
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
