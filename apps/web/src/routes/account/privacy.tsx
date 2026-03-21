import { useMutation } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { apiClient } from '@/api/client';

export const Route = createFileRoute('/account/privacy')({
  component: AccountPrivacy,
});

const DATA_RIGHTS = [
  {
    title: 'Right to access',
    desc: 'You can download a copy of all data we hold about you using the export tool below.',
  },
  {
    title: 'Right to rectification',
    desc: 'Profile information (name, avatar) is sourced from Discord. To change it, update your Discord profile.',
  },
  {
    title: 'Right to erasure',
    desc: 'You can request deletion of your account and all associated data. Processing takes up to 30 days per Article 17 of GDPR.',
  },
  {
    title: 'Right to portability',
    desc: 'Your data is available as a structured JSON file via the export tool below.',
  },
  {
    title: 'Right to restrict processing',
    desc: 'Contact us to restrict processing of your data. Use the link below.',
  },
];

function AccountPrivacy() {
  const navigate = useNavigate();
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const deleteMut = useMutation({
    mutationFn: () => apiClient.delete('/api/connect/user/gdpr-delete'),
    onSuccess: () => {
      navigate({ to: '/' });
    },
    onError: () => {
      setDeleteError('Failed to submit deletion request. Please try again.');
    },
  });

  async function handleExport() {
    setExportLoading(true);
    try {
      const response = await fetch('/api/connect/user/data-export', {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'yucp-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silently fail — user will see no download
    } finally {
      setExportLoading(false);
    }
  }

  const canDelete = deleteInput.trim() === 'DELETE';

  return (
    <>
      <section className="account-section">
        <div className="account-section-header">
          <h2 className="account-section-title">Your Data</h2>
          <p className="account-section-desc">
            Download or manage the data we hold about your account
          </p>
        </div>
        <div className="account-section-body">
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: '14px', fontWeight: 500, margin: '0 0 4px', color: 'inherit' }}>
                Download your data
              </p>
              <p style={{ fontSize: '13px', color: 'var(--text-muted, #888)', margin: 0, lineHeight: 1.5 }}>
                Includes your profile, verified purchases, authorized apps, and provider
                connections. Credential values are never included.
              </p>
            </div>
            <button
              type="button"
              className={`account-btn account-btn--secondary${exportLoading ? ' btn-loading' : ''}`}
              onClick={handleExport}
              disabled={exportLoading}
            >
              {exportLoading && <span className="btn-loading-spinner" aria-hidden="true" />}
              {exportLoading ? 'Preparing export...' : 'Download'}
            </button>
          </div>
        </div>
      </section>

      <section className="account-section">
        <div className="account-section-header">
          <h2 className="account-section-title">Your Rights</h2>
          <p className="account-section-desc">Under GDPR and applicable privacy law</p>
        </div>
        <div className="account-section-body">
          <ul className="account-rights-list">
            {DATA_RIGHTS.map((right) => (
              <li key={right.title} className="account-rights-item">
                <span className="account-rights-item-dot" aria-hidden="true" />
                <span className="account-rights-item-text">
                  <span className="account-rights-item-title">{right.title}</span>{' '}
                  {right.desc}
                </span>
              </li>
            ))}
          </ul>
          <p style={{ fontSize: '12px', color: 'var(--text-muted, #888)', marginTop: '8px' }}>
            For manual requests, contact us via{' '}
            <a
              href="mailto:privacy@yucp.club"
              style={{ color: '#7c3aed', textDecoration: 'none' }}
            >
              privacy@yucp.club
            </a>
            .{' '}
            <a
              href="/legal/privacy-policy"
              style={{ color: '#7c3aed', textDecoration: 'none' }}
              target="_blank"
              rel="noopener noreferrer"
            >
              Privacy Policy
            </a>
          </p>
        </div>
      </section>

      <section className="account-section">
        <div className="account-section-header">
          <h2 className="account-section-title">Danger Zone</h2>
        </div>
        <div className="account-section-body">
          <div className="account-danger-zone">
            <p className="account-danger-zone-title">Delete account</p>
            <p className="account-danger-zone-desc">
              Permanently removes your account, all verified licenses, and provider connections.
              Discord roles granted by this system will be revoked. This is processed within
              30 days per GDPR Article 17 and cannot be undone.
            </p>
            <button
              type="button"
              className="account-btn account-btn--danger"
              onClick={() => { setDeleteConfirm(true); setDeleteInput(''); setDeleteError(null); }}
            >
              Request account deletion
            </button>
          </div>
        </div>
      </section>

      {deleteConfirm && (
        <div className="account-modal-backdrop" onClick={() => setDeleteConfirm(false)}>
          <div className="account-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="account-modal-title">Delete account permanently?</h3>
            <p className="account-modal-body">
              This will revoke all licenses, remove Discord roles, and delete your data
              within 30 days. This action cannot be undone.{' '}
              <br /><br />
              Type <strong>DELETE</strong> to confirm.
            </p>
            <input
              type="text"
              className="account-modal-input"
              placeholder="DELETE"
              value={deleteInput}
              onChange={(e) => setDeleteInput(e.target.value)}
              autoFocus
              disabled={deleteMut.isPending}
            />
            {deleteError && (
              <p style={{ fontSize: '13px', color: '#dc2626', margin: '0' }}>{deleteError}</p>
            )}
            <div className="account-modal-actions">
              <button
                type="button"
                className="account-btn account-btn--secondary"
                onClick={() => setDeleteConfirm(false)}
                disabled={deleteMut.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`account-btn account-btn--danger${deleteMut.isPending ? ' btn-loading' : ''}`}
                onClick={() => deleteMut.mutate()}
                disabled={!canDelete || deleteMut.isPending}
              >
                {deleteMut.isPending && <span className="btn-loading-spinner" aria-hidden="true" />}
                {deleteMut.isPending ? 'Submitting...' : 'Delete my account'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
