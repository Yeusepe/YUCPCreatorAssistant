import { createLazyFileRoute } from '@tanstack/react-router';

export const Route = createLazyFileRoute('/_authenticated/dashboard/audit-logs')({
  component: DashboardAuditLogs,
});

function DashboardAuditLogs() {
  return (
    <div
      id="tab-panel-audit-logs"
      className="dashboard-tab-panel is-active server-only"
      role="tabpanel"
      aria-labelledby="tab-btn-audit-logs"
    >
      <div className="bento-grid">
        <section className="intg-card bento-col-12 animate-in animate-in-delay-1">
          <div className="empty-state" style={{ padding: '40px 24px' }}>
            <div
              className="intg-icon"
              style={{ margin: '0 auto 16px', width: '48px', height: '48px' }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <span className="intg-status-badge" style={{ marginBottom: '14px' }}>
              <span
                style={{
                  display: 'inline-block',
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  background: 'currentColor',
                  marginRight: '5px',
                }}
              />
              In development
            </span>
            <p className="empty-state-title">Audit Logs</p>
            <p className="empty-state-copy">
              A full audit trail of verification events, role assignments, and member activity is on
              the way. You will be able to filter by event type, date range, and member.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
