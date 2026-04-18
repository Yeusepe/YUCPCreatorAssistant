import { createLazyFileRoute } from '@tanstack/react-router';
import { useMutation as useConvexMutation, useQuery as useConvexQuery } from 'convex/react';
import { useMemo, useState } from 'react';
import { AccountPage, AccountSectionCard } from '@/components/account/AccountPage';
import { DashboardListSkeleton } from '@/components/dashboard/DashboardSkeletons';
import { useToast } from '@/components/ui/Toast';
import { YucpButton } from '@/components/ui/YucpButton';
import { authClient } from '@/lib/auth-client';
import { api } from '../../../../../../convex/_generated/api';
import type { Id } from '../../../../../../convex/_generated/dataModel';

export const Route = createLazyFileRoute('/_authenticated/account/security')({
  pendingComponent: SecurityPending,
  component: AccountSecurityPage,
});

interface PasskeyRecord {
  id: string;
  name?: string | null;
  deviceType?: string | null;
  backedUp?: boolean;
  createdAt?: Date | string | number | null;
}

function SecurityPending() {
  return (
    <AccountPage>
      <DashboardListSkeleton rows={5} />
    </AccountPage>
  );
}

function formatCreatedAt(value: Date | string | number | null | undefined) {
  if (!value) {
    return 'Unknown date';
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown date';
  }

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function AccountSecurityPage() {
  const toast = useToast();
  const securityOverview = useConvexQuery(api.accountSecurity.getSecurityOverview, {});
  const syncSecurityState = useConvexMutation(api.accountSecurity.syncSecurityState);
  const prepareRecoveryContactEnrollment = useConvexMutation(
    api.accountSecurity.prepareRecoveryContactEnrollment
  );
  const verifyRecoveryContactEnrollment = useConvexMutation(
    api.accountSecurity.verifyRecoveryContactEnrollment
  );
  const removeRecoveryContact = useConvexMutation(api.accountSecurity.removeRecoveryContact);
  const markAuthenticatorCompromised = useConvexMutation(
    api.accountSecurity.markAuthenticatorCompromised
  );
  const revokeAllUserSessions = useConvexMutation(api.accountSecurity.revokeAllUserSessions);
  const dismissRecoveryPrompt = useConvexMutation(api.accountSecurity.dismissRecoveryPrompt);
  const passkeysQuery = authClient.useListPasskeys();

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryEmailOtp, setRecoveryEmailOtp] = useState('');
  const [pendingRecoveryEmail, setPendingRecoveryEmail] = useState<string | null>(null);
  const [freshBackupCodes, setFreshBackupCodes] = useState<string[]>([]);
  const passkeys: PasskeyRecord[] = passkeysQuery.data ?? [];
  const isLoadingPasskeys = passkeysQuery.isPending;

  const summaryItems = useMemo(
    () => [
      {
        label: 'Passkeys',
        value: securityOverview?.passkeyCount ?? 0,
      },
      {
        label: 'Backup codes',
        value: securityOverview?.backupCodeCount ?? 0,
      },
      {
        label: 'Recovery emails',
        value: securityOverview?.verifiedRecoveryEmailCount ?? 0,
      },
      {
        label: 'Creator policy',
        value: securityOverview?.isCreatorAccount ? 'High-sensitivity' : 'Personal',
      },
    ],
    [securityOverview]
  );

  async function refreshPasskeys(eventType?: Parameters<typeof syncSecurityState>[0]['eventType']) {
    await syncSecurityState(eventType ? { eventType } : {});
    await passkeysQuery.refetch();
  }

  async function handleAddPasskey() {
    setPendingAction('add-passkey');
    try {
      const defaultName = `Passkey ${passkeys.length + 1}`;
      const result = await authClient.passkey.addPasskey({
        name: defaultName,
      });
      if (result.error) {
        throw new Error(result.error.message ?? 'Could not add passkey');
      }
      await refreshPasskeys('account.security.passkey.added');
      toast.success('Passkey added', {
        description: 'This passkey is now available as a recovery factor.',
      });
    } catch (error) {
      toast.error('Could not add passkey', {
        description: error instanceof Error ? error.message : 'Try again from this browser.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDeletePasskey(passkeyId: string) {
    setPendingAction(`delete-passkey:${passkeyId}`);
    try {
      const result = await authClient.passkey.deletePasskey({ id: passkeyId });
      if (result.error) {
        throw new Error(result.error.message ?? 'Could not remove passkey');
      }
      await refreshPasskeys('account.security.passkey.removed');
      toast.success('Passkey removed');
    } catch (error) {
      toast.error('Could not remove passkey', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleEnableBackupCodes() {
    setPendingAction('enable-backup-codes');
    try {
      const result = await authClient.twoFactor.enable({});
      if (result.error) {
        throw new Error(result.error.message ?? 'Could not enable backup codes');
      }
      const codes = result.data?.backupCodes ?? [];
      setFreshBackupCodes(codes);
      await syncSecurityState({
        eventType: 'account.security.backup_codes.regenerated',
      });
      toast.success('Backup codes ready', {
        description: 'Store them somewhere offline. Each code works once.',
      });
    } catch (error) {
      toast.error('Could not enable backup codes', {
        description:
          error instanceof Error ? error.message : 'The security state could not be updated.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRegenerateBackupCodes() {
    setPendingAction('regenerate-backup-codes');
    try {
      const result = await authClient.twoFactor.generateBackupCodes({});
      if (result.error) {
        throw new Error(result.error.message ?? 'Could not regenerate backup codes');
      }
      const codes = result.data?.backupCodes ?? [];
      setFreshBackupCodes(codes);
      await syncSecurityState({
        eventType: 'account.security.backup_codes.regenerated',
      });
      toast.success('Backup codes regenerated');
    } catch (error) {
      toast.error('Could not regenerate backup codes', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleStartRecoveryEmailEnrollment() {
    if (!recoveryEmail.trim()) {
      toast.error('Enter a recovery email');
      return;
    }

    setPendingAction('send-recovery-email-otp');
    try {
      const prepared = await prepareRecoveryContactEnrollment({
        email: recoveryEmail.trim(),
      });
      const result = await authClient.emailOtp.sendVerificationOtp({
        email: prepared.email,
        type: 'email-verification',
      });
      if (result.error) {
        throw new Error(result.error.message ?? 'Could not send verification code');
      }
      setPendingRecoveryEmail(prepared.email);
      toast.success('Verification code sent', {
        description: 'Enter the code from your recovery inbox to finish enrollment.',
      });
    } catch (error) {
      toast.error('Could not send verification code', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleVerifyRecoveryEmail() {
    if (!pendingRecoveryEmail || !recoveryEmailOtp.trim()) {
      toast.error('Enter the verification code');
      return;
    }

    setPendingAction('verify-recovery-email-otp');
    try {
      const result = await authClient.emailOtp.checkVerificationOtp({
        email: pendingRecoveryEmail,
        type: 'email-verification',
        otp: recoveryEmailOtp.trim(),
      });
      if (result.error) {
        throw new Error(result.error.message ?? 'Invalid verification code');
      }
      await verifyRecoveryContactEnrollment({
        email: pendingRecoveryEmail,
      });
      setPendingRecoveryEmail(null);
      setRecoveryEmail('');
      setRecoveryEmailOtp('');
      toast.success('Recovery email verified');
    } catch (error) {
      toast.error('Could not verify recovery email', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRemoveRecoveryEmail(contactId: Id<'account_recovery_contacts'>) {
    setPendingAction(`remove-recovery-email:${contactId}`);
    try {
      await removeRecoveryContact({ contactId });
      toast.success('Recovery email removed');
    } catch (error) {
      toast.error('Could not remove recovery email', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleCompromised(
    kind: 'primary-email' | 'discord' | 'recovery-email',
    contactId?: Id<'account_recovery_contacts'>
  ) {
    setPendingAction(kind);
    try {
      await markAuthenticatorCompromised({
        kind,
        ...(contactId ? { contactId } : {}),
      });
      toast.warning('Security factor marked as compromised', {
        description: 'Recovery from that factor is now suppressed until you replace it.',
      });
    } catch (error) {
      toast.error('Could not update compromise state', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleDismissPrompt() {
    setPendingAction('dismiss-prompt');
    try {
      await dismissRecoveryPrompt({});
      toast.info('Recovery reminder dismissed for now');
    } catch (error) {
      toast.error('Could not dismiss reminder', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  async function handleRevokeSessions() {
    setPendingAction('revoke-sessions');
    try {
      await revokeAllUserSessions({});
      toast.success('All sessions revoked', {
        description: 'Sign in again on the devices you still trust.',
      });
    } catch (error) {
      toast.error('Could not revoke sessions', {
        description: error instanceof Error ? error.message : 'Try again.',
      });
    } finally {
      setPendingAction(null);
    }
  }

  if (securityOverview === undefined) {
    return <SecurityPending />;
  }

  return (
    <AccountPage>
      <AccountSectionCard
        className="bento-col-12"
        eyebrow="Security posture"
        title="Recovery factors"
        description="Discord stays primary, but Better Auth passkeys, backup codes, and verified recovery email protect the account when Discord or email access changes."
        actions={
          <YucpButton
            yucp="secondary"
            isLoading={pendingAction === 'dismiss-prompt'}
            onPress={handleDismissPrompt}
          >
            Dismiss reminder
          </YucpButton>
        }
      >
        {securityOverview.shouldShowPrompt ? (
          <div className="account-status-banner account-status-banner--warning">
            <div className="account-status-banner-copy">
              <strong>Recovery is still weak.</strong>
              <span>
                Add at least one strong fallback now. Creator accounts should not rely on the
                Discord email alone.
              </span>
            </div>
          </div>
        ) : (
          <div className="account-status-banner account-status-banner--success">
            <div className="account-status-banner-copy">
              <strong>Recovery posture recorded.</strong>
              <span>
                Keep at least one passkey, backup code set, or verified recovery email active.
              </span>
            </div>
          </div>
        )}

        <div className="account-stat-grid">
          {summaryItems.map((item) => (
            <div key={item.label} className="account-stat-card">
              <span className="account-stat-label">{item.label}</span>
              <span className="account-stat-value">{item.value}</span>
            </div>
          ))}
        </div>
      </AccountSectionCard>

      <AccountSectionCard
        className="bento-col-6"
        eyebrow="Passkeys"
        title="Passkey recovery"
        description="Passkeys are the preferred passwordless recovery factor because Better Auth can use them for both sign-in and account recovery."
        actions={
          <YucpButton
            yucp="primary"
            isLoading={pendingAction === 'add-passkey'}
            onPress={handleAddPasskey}
          >
            Add passkey
          </YucpButton>
        }
      >
        {isLoadingPasskeys ? (
          <p className="account-feature-copy">Loading passkeys...</p>
        ) : passkeys.length === 0 ? (
          <p className="account-feature-copy">
            No passkeys enrolled yet. Add one from this browser or your hardware security key.
          </p>
        ) : (
          <div className="account-security-list">
            {passkeys.map((passkey) => (
              <div key={passkey.id} className="account-security-row">
                <div className="account-security-copy">
                  <p className="account-security-title">{passkey.name || 'Unnamed passkey'}</p>
                  <p className="account-security-meta">
                    {passkey.deviceType || 'Authenticator device'} · Added{' '}
                    {formatCreatedAt(passkey.createdAt)}
                    {passkey.backedUp ? ' · Synced' : ''}
                  </p>
                </div>
                <YucpButton
                  yucp="secondary"
                  isLoading={pendingAction === `delete-passkey:${passkey.id}`}
                  onPress={() => handleDeletePasskey(passkey.id)}
                >
                  Remove
                </YucpButton>
              </div>
            ))}
          </div>
        )}
      </AccountSectionCard>

      <AccountSectionCard
        className="bento-col-6"
        eyebrow="Backup codes"
        title="Emergency codes"
        description="Better Auth stores backup codes as encrypted two-factor recovery codes. Each code works once."
        actions={
          securityOverview.hasBackupCodes ? (
            <YucpButton
              yucp="secondary"
              isLoading={pendingAction === 'regenerate-backup-codes'}
              onPress={handleRegenerateBackupCodes}
            >
              Regenerate
            </YucpButton>
          ) : (
            <YucpButton
              yucp="primary"
              isLoading={pendingAction === 'enable-backup-codes'}
              onPress={handleEnableBackupCodes}
            >
              Enable backup codes
            </YucpButton>
          )
        }
      >
        <p className="account-feature-copy">
          {securityOverview.hasBackupCodes
            ? `${securityOverview.backupCodeCount} backup codes remain available. Regenerating them invalidates the current set.`
            : 'Enable passwordless 2FA once and Better Auth will mint encrypted backup codes for recovery.'}
        </p>
        {freshBackupCodes.length > 0 ? (
          <div className="account-security-code-grid">
            {freshBackupCodes.map((code) => (
              <code key={code} className="account-security-code">
                {code}
              </code>
            ))}
          </div>
        ) : null}
      </AccountSectionCard>

      <AccountSectionCard
        className="bento-col-8"
        eyebrow="Recovery email"
        title="Verified secondary recovery email"
        description="Use a second inbox you control. Creator accounts should keep this separate from the Discord primary email."
      >
        <div className="account-security-form">
          <label className="account-security-label" htmlFor="recovery-email">
            Recovery email
          </label>
          <input
            id="recovery-email"
            className="account-security-input"
            type="email"
            value={recoveryEmail}
            onChange={(event) => setRecoveryEmail(event.target.value)}
            placeholder="owner@example.com"
            autoComplete="email"
          />
          <YucpButton
            yucp="primary"
            isLoading={pendingAction === 'send-recovery-email-otp'}
            onPress={handleStartRecoveryEmailEnrollment}
          >
            Send verification code
          </YucpButton>
        </div>

        {pendingRecoveryEmail ? (
          <div className="account-security-form">
            <label className="account-security-label" htmlFor="recovery-email-otp">
              Verification code
            </label>
            <input
              id="recovery-email-otp"
              className="account-security-input"
              type="text"
              inputMode="numeric"
              value={recoveryEmailOtp}
              onChange={(event) => setRecoveryEmailOtp(event.target.value)}
              placeholder="123456"
              autoComplete="one-time-code"
            />
            <YucpButton
              yucp="secondary"
              isLoading={pendingAction === 'verify-recovery-email-otp'}
              onPress={handleVerifyRecoveryEmail}
            >
              Verify recovery email
            </YucpButton>
          </div>
        ) : null}

        <div className="account-security-list">
          {securityOverview.recoveryContacts.length === 0 ? (
            <p className="account-feature-copy">No verified recovery email is enrolled yet.</p>
          ) : (
            securityOverview.recoveryContacts.map(
              (contact: (typeof securityOverview.recoveryContacts)[number]) => (
                <div key={contact.id} className="account-security-row">
                  <div className="account-security-copy">
                    <p className="account-security-title">
                      {contact.email || 'Encrypted recovery email'}
                    </p>
                    <p className="account-security-meta">
                      {contact.status} · Added {formatCreatedAt(contact.addedAt)}
                    </p>
                  </div>
                  <div className="account-inline-actions">
                    <YucpButton
                      yucp="secondary"
                      isLoading={pendingAction === `remove-recovery-email:${contact.id}`}
                      onPress={() =>
                        handleRemoveRecoveryEmail(contact.id as Id<'account_recovery_contacts'>)
                      }
                    >
                      Remove
                    </YucpButton>
                    <YucpButton
                      yucp="danger"
                      isLoading={pendingAction === 'recovery-email'}
                      onPress={() =>
                        handleCompromised(
                          'recovery-email',
                          contact.id as Id<'account_recovery_contacts'>
                        )
                      }
                    >
                      Mark compromised
                    </YucpButton>
                  </div>
                </div>
              )
            )
          )}
        </div>
      </AccountSectionCard>

      <AccountSectionCard
        className="bento-col-4"
        eyebrow="Containment"
        title="Compromised factors"
        description="Suppress a compromised channel immediately, then revoke sessions so recovery must continue from a still-trusted factor."
      >
        <div className="account-inline-actions account-inline-actions--stack">
          <YucpButton
            yucp="danger"
            isLoading={pendingAction === 'primary-email'}
            onPress={() => handleCompromised('primary-email')}
          >
            Primary email compromised
          </YucpButton>
          <YucpButton
            yucp="danger"
            isLoading={pendingAction === 'discord'}
            onPress={() => handleCompromised('discord')}
          >
            Discord compromised
          </YucpButton>
          <YucpButton
            yucp="secondary"
            isLoading={pendingAction === 'revoke-sessions'}
            onPress={handleRevokeSessions}
          >
            Revoke all sessions
          </YucpButton>
        </div>
      </AccountSectionCard>
    </AccountPage>
  );
}
