import { useQuery as useConvexQuery } from 'convex/react';
import { ActivityItem } from '@/components/dashboard/cards/ActivityItem';
import { SkeletonCircle, SkeletonLine } from '@/components/ui/YucpSkeleton';
import { api } from '../../../../../../convex/_generated/api';

interface ActivityEvent {
  eventType: string;
  actorType: string;
  actorId?: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

const EVENT_DESCRIPTIONS: Record<string, (metadata?: Record<string, unknown>) => string> = {
  'entitlement.granted': (metadata) => {
    const product = metadata?.productName ?? metadata?.product_name;
    return product ? `Entitlement granted for ${String(product)}` : 'Entitlement granted';
  },
  'entitlement.revoked': () => 'Entitlement revoked',
  'discord.role.sync.completed': () => 'Discord roles synced',
  'verification.session.completed': () => 'Verification completed',
  'guild.linked': () => 'Server connected',
  'guild.unlinked': () => 'Server disconnected',
  'binding.created': () => 'Account linked',
  'binding.revoked': () => 'Account unlinked',
  'creator.policy.updated': () => 'Settings updated',
  'setup.job.created': () => 'Automatic setup started',
  'setup.job.resumed': () => 'Automatic setup resumed',
  'setup.job.status.updated': (metadata) => {
    const phase = metadata?.currentPhase;
    return phase
      ? `Automatic setup moved to ${String(phase).replace(/_/g, ' ')}`
      : 'Automatic setup updated';
  },
  'migration.job.created': () => 'Migration plan started',
  'migration.job.status.updated': () => 'Migration plan updated',
};

function humanizeEventType(eventType: string): string {
  return eventType.replace(/\./g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function describeEvent(event: ActivityEvent): string {
  const describer = EVENT_DESCRIPTIONS[event.eventType];
  if (describer) {
    return describer(event.metadata as Record<string, unknown> | undefined);
  }
  return humanizeEventType(event.eventType);
}

function ActivitySkeleton() {
  return (
    <div className="flex items-start gap-3 py-3" aria-hidden="true">
      <SkeletonCircle size="24px" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <SkeletonLine width="180px" style={{ height: '14px' }} />
        <SkeletonLine width="60px" style={{ height: '11px' }} />
      </div>
    </div>
  );
}

export function RecentActivityPanel() {
  const activity = useConvexQuery(api.dashboardViews.listMyRecentActivity);
  const isLoading = activity === undefined;

  return (
    <section
      id="recent-activity-panel"
      className="intg-card animate-in animate-in-delay-2"
      aria-label="Recent activity"
    >
      {/* Header */}
      <div className="intg-header">
        <div className="intg-title-row">
          <div className="intg-icon">
            <img src="/Icons/Timer.png" alt="" />
          </div>
          <div className="intg-copy">
            <h2 className="intg-title">Recent Activity</h2>
            <p className="intg-desc">Latest verification and sync events.</p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div>
        {isLoading ? (
          <div className="flex flex-col">
            {Array.from({ length: 5 }, (_, i) => {
              const skeletonId = `activity-skeleton-${String(i)}`;
              return <ActivitySkeleton key={skeletonId} />;
            })}
          </div>
        ) : activity.length === 0 ? (
          <div className="intg-empty-state">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p className="intg-empty-state-text">No recent activity</p>
          </div>
        ) : (
          <div className="flex flex-col" style={{ maxHeight: 380, overflowY: 'auto' }}>
            {activity.map((event, index) => (
              <ActivityItem
                key={`${event.eventType}-${String(event.createdAt)}-${String(index)}`}
                eventType={event.eventType}
                description={describeEvent(event)}
                timestamp={event.createdAt}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
