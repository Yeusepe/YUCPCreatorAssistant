import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const useQueryMock = vi.fn();
const useMutationMock = vi.fn(() => vi.fn());
const toastSuccessMock = vi.fn();
const toastErrorMock = vi.fn();
const createOrResumeSetupJobMock = vi.fn();
const applyRecommendedSetupMock = vi.fn();
const createMigrationJobMock = vi.fn();
const updateSetupPreferencesMock = vi.fn();
const overrideRolePlanEntryMock = vi.fn();

vi.mock('@tanstack/react-router', () => ({
  Link: ({
    children,
    to,
    search: _search,
    ...props
  }: {
    children: ReactNode;
    to?: string;
    [key: string]: unknown;
  }) => (
    <a href={typeof to === 'string' ? to : '#'} {...props}>
      {children}
    </a>
  ),
  createLazyFileRoute: () => (options: unknown) => ({ options }),
}));

vi.mock('convex/react', () => ({
  useQuery: (...args: unknown[]) => useQueryMock(...args),
  useMutation: (...args: unknown[]) => useMutationMock(...args),
}));

vi.mock('../../../../../../convex/_generated/api', () => ({
  api: {
    setupJobs: {
      getMySetupJobForGuild: 'getMySetupJobForGuild',
      getMySetupSummaryByGuild: 'getMySetupSummaryByGuild',
      getMyLatestMigrationJobForGuild: 'getMyLatestMigrationJobForGuild',
      createOrResumeSetupJobByGuild: 'createOrResumeSetupJobByGuild',
      applyRecommendedSetupByGuild: 'applyRecommendedSetupByGuild',
      createMigrationJobByGuild: 'createMigrationJobByGuild',
      updateSetupPreferencesByGuild: 'updateSetupPreferencesByGuild',
      overrideRolePlanEntry: 'overrideRolePlanEntry',
    },
  },
}));

vi.mock('@/components/dashboard/AuthRequiredState', () => ({
  DashboardAuthRequiredState: ({ title }: { title: string }) => <div>{title}</div>,
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ success: toastSuccessMock, error: toastErrorMock }),
}));

vi.mock('@/components/ui/YucpButton', () => ({
  YucpButton: ({
    children,
    onPress,
    isLoading,
  }: {
    children: ReactNode;
    onPress?: () => void;
    isLoading?: boolean;
  }) => (
    <button type="button" onClick={onPress} aria-busy={isLoading}>
      {children}
    </button>
  ),
}));

vi.mock('@/hooks/useActiveDashboardContext', () => ({
  useActiveDashboardContext: vi.fn(() => ({
    activeGuildId: 'guild-123',
    activeTenantId: 'tenant-123',
    isPersonalDashboard: false,
  })),
}));

vi.mock('@/hooks/useDashboardShell', () => ({
  useDashboardShell: vi.fn(() => ({
    home: {
      providers: [],
      userAccounts: [],
    },
    selectedGuild: {
      id: 'guild-123',
      name: 'Test Guild',
      tenantId: 'tenant-123',
    },
  })),
}));

vi.mock('@/hooks/useDashboardSession', () => ({
  useDashboardSession: vi.fn(() => ({
    hasHydrated: true,
    markSessionExpired: vi.fn(),
    status: 'active',
  })),
}));

import {
  Route as DashboardSetupRoute,
  deriveSetupLandingState,
} from '@/routes/_authenticated/dashboard/setup.lazy';

function mockSetupRouteQueries(args: {
  setupJob?: unknown;
  setupSummary?: unknown;
  migrationJob?: unknown;
}) {
  const values = [args.setupJob, args.setupSummary, args.migrationJob];
  let callIndex = 0;
  useQueryMock.mockImplementation(() => {
    const fallback = values[callIndex % values.length];
    callIndex += 1;
    return fallback;
  });
}

describe('dashboard setup route', () => {
  beforeEach(() => {
    cleanup();
    useQueryMock.mockReset();
    useMutationMock.mockReset();
    toastSuccessMock.mockReset();
    toastErrorMock.mockReset();
    createOrResumeSetupJobMock.mockReset();
    applyRecommendedSetupMock.mockReset();
    createMigrationJobMock.mockReset();
    updateSetupPreferencesMock.mockReset();
    overrideRolePlanEntryMock.mockReset();
    createOrResumeSetupJobMock.mockResolvedValue({ created: true });
    applyRecommendedSetupMock.mockResolvedValue(undefined);
    createMigrationJobMock.mockResolvedValue(undefined);
    updateSetupPreferencesMock.mockResolvedValue(undefined);
    overrideRolePlanEntryMock.mockResolvedValue(undefined);
    useMutationMock.mockImplementation((mutation) => {
      switch (mutation) {
        case 'createOrResumeSetupJobByGuild':
          return createOrResumeSetupJobMock;
        case 'applyRecommendedSetupByGuild':
          return applyRecommendedSetupMock;
        case 'createMigrationJobByGuild':
          return createMigrationJobMock;
        case 'updateSetupPreferencesByGuild':
          return updateSetupPreferencesMock;
        case 'overrideRolePlanEntry':
          return overrideRolePlanEntryMock;
        default:
          return vi.fn();
      }
    });
  });

  it('shows a beginner-friendly start page for a new server', () => {
    mockSetupRouteQueries({
      setupJob: null,
      setupSummary: {
        enabledRoleRuleCount: 0,
        verificationPromptLive: false,
        lastCompletedSetupAt: null,
      },
      migrationJob: null,
    });

    const Component = DashboardSetupRoute.options.component;
    if (!Component) {
      throw new Error('Dashboard setup route component is not defined');
    }

    render(<Component />);

    expect(screen.getByText('Set up product verification for this server')).toBeInTheDocument();
    expect(screen.getByText(/Before you begin, make sure you have/)).toBeInTheDocument();
    expect(screen.getByText('Setup choices')).toBeInTheDocument();
    expect(screen.getByText(/Automatic channel creation is off/)).toBeInTheDocument();
    expect(screen.getByText('Start setup')).toBeInTheDocument();
    expect(screen.getByText('Switching from another bot?')).toBeInTheDocument();
  });

  it('shows a focused wizard step for setup in progress', () => {
    mockSetupRouteQueries({
      setupJob: {
        job: {
          status: 'waiting_for_user',
          currentPhase: 'review_exceptions',
          summary: {
            preferences: {
              rolePlanMode: 'create_or_adopt',
              verificationMessageMode: 'leave_unchanged',
            },
          },
        },
        steps: [
          { id: 'step-1', label: 'Connect store', status: 'completed' },
          { id: 'step-2', label: 'Scan server', status: 'completed' },
        ],
        recommendations: [
          {
            id: 'rec-1',
            status: 'proposed',
            recommendationType: 'role_creation',
            title: 'Create subscriber role',
            detail: null,
          },
        ],
        activeMigrationJobId: null,
      },
      setupSummary: {
        enabledRoleRuleCount: 0,
        verificationPromptLive: false,
        lastCompletedSetupAt: null,
      },
      migrationJob: null,
    });

    const Component = DashboardSetupRoute.options.component;
    if (!Component) {
      throw new Error('Dashboard setup route component is not defined');
    }

    render(<Component />);

    expect(screen.getByText('Review your setup plan')).toBeInTheDocument();
    expect(screen.getByText('Step 3 of 3')).toBeInTheDocument();
    expect(screen.getByText('Setup choices')).toBeInTheDocument();
    expect(screen.getByText('Apply 1 change')).toBeInTheDocument();
    expect(screen.getByText('What will happen when you click Apply')).toBeInTheDocument();
  });

  it('shows a maintenance view when the server is already configured', () => {
    mockSetupRouteQueries({
      setupJob: null,
      setupSummary: {
        enabledRoleRuleCount: 4,
        verificationPromptLive: true,
        lastCompletedSetupAt: Date.UTC(2026, 3, 12),
      },
      migrationJob: null,
    });

    const Component = DashboardSetupRoute.options.component;
    if (!Component) {
      throw new Error('Dashboard setup route component is not defined');
    }

    render(<Component />);

    expect(screen.getByText('This server is already set up')).toBeInTheDocument();
    expect(screen.getByText('Storefronts connected')).toBeInTheDocument();
    expect(screen.getByText('Product-role mappings')).toBeInTheDocument();
    expect(screen.getByText('Verification message')).toBeInTheDocument();
    expect(screen.getByText('Update setup')).toBeInTheDocument();
    expect(screen.getByText('Add another store')).toBeInTheDocument();
    expect(screen.getByText('Update role mappings')).toBeInTheDocument();
  });

  it('restarts setup from maintenance without sending the button event as preferences', async () => {
    useMutationMock.mockReturnValue(createOrResumeSetupJobMock);
    mockSetupRouteQueries({
      setupJob: null,
      setupSummary: {
        enabledRoleRuleCount: 4,
        verificationPromptLive: true,
        lastCompletedSetupAt: Date.UTC(2026, 3, 12),
      },
      migrationJob: null,
    });

    const Component = DashboardSetupRoute.options.component;
    if (!Component) {
      throw new Error('Dashboard setup route component is not defined');
    }

    render(<Component />);
    fireEvent.click(screen.getByText('Update setup'));

    await waitFor(() =>
      expect(createOrResumeSetupJobMock).toHaveBeenCalledWith({
        guildId: 'guild-123',
        mode: 'automatic_setup',
        triggerSource: 'dashboard',
      })
    );
  });

  it('passes the active setup job id when starting migration from the setup route', async () => {
    useMutationMock.mockReturnValue(createMigrationJobMock);
    mockSetupRouteQueries({
      setupJob: {
        job: {
          id: 'setup-job-123',
          status: 'completed',
          currentPhase: 'confirm_cutover',
          summary: {
            preferences: {
              rolePlanMode: 'create_or_adopt',
              verificationMessageMode: 'leave_unchanged',
            },
          },
        },
        steps: [],
        recommendations: [],
        activeMigrationJobId: null,
      },
      setupSummary: {
        enabledRoleRuleCount: 2,
        verificationPromptLive: true,
        lastCompletedSetupAt: Date.UTC(2026, 3, 12),
      },
      migrationJob: null,
    });

    const Component = DashboardSetupRoute.options.component;
    if (!Component) {
      throw new Error('Dashboard setup route component is not defined');
    }

    render(<Component />);
    fireEvent.click(screen.getByRole('button', { name: 'Adopt roles from another bot' }));

    await waitFor(() => expect(createMigrationJobMock).toHaveBeenCalledTimes(1));
    expect(createMigrationJobMock.mock.calls[0]?.[0]).toMatchObject({
      guildId: 'guild-123',
      setupJobId: 'setup-job-123',
      mode: 'adopt_existing_roles',
      preferences: {
        unmatchedProductBehavior: 'review',
        cutoverStyle: 'switch_when_ready',
      },
    });
  });

  it('reconciles the apply selection when the proposed recommendation list changes', async () => {
    const values: [unknown, unknown, unknown] = [
      {
        job: {
          id: 'setup-job-123',
          status: 'waiting_for_user',
          currentPhase: 'review_exceptions',
          summary: {
            preferences: {
              rolePlanMode: 'create_or_adopt',
              verificationMessageMode: 'leave_unchanged',
            },
          },
        },
        steps: [],
        recommendations: [
          {
            id: 'rec-1',
            status: 'proposed',
            recommendationType: 'role_creation',
            title: 'Create Alpha role',
            detail: null,
          },
          {
            id: 'rec-2',
            status: 'proposed',
            recommendationType: 'role_creation',
            title: 'Create Beta role',
            detail: null,
          },
        ],
        activeMigrationJobId: null,
      },
      {
        enabledRoleRuleCount: 0,
        verificationPromptLive: false,
        lastCompletedSetupAt: null,
      },
      null,
    ];
    let callIndex = 0;
    useQueryMock.mockImplementation(() => {
      const fallback = values[callIndex % values.length];
      callIndex += 1;
      return fallback;
    });

    const Component = DashboardSetupRoute.options.component;
    if (!Component) {
      throw new Error('Dashboard setup route component is not defined');
    }

    const rendered = render(<Component />);
    fireEvent.click(screen.getByText('Create Alpha role'));
    expect(screen.getByText('Apply 1 change')).toBeInTheDocument();

    values[0] = {
      ...(values[0] as Record<string, unknown>),
      recommendations: [
        {
          id: 'rec-3',
          status: 'proposed',
          recommendationType: 'role_creation',
          title: 'Create Gamma role',
          detail: null,
        },
        {
          id: 'rec-4',
          status: 'proposed',
          recommendationType: 'role_creation',
          title: 'Create Delta role',
          detail: null,
        },
      ],
    };

    rendered.rerender(<Component />);

    expect(screen.getByText('Apply 2 changes')).toBeInTheDocument();
  });

  it('shows a needs-attention view with fix guidance when setup is blocked', () => {
    const landingState = deriveSetupLandingState({
      setupJob: {
        job: {
          status: 'blocked',
          currentPhase: 'scan_server',
          blockingReason: 'The bot does not have permission to manage roles.',
        },
        steps: [],
        recommendations: [],
        activeMigrationJobId: null,
      },
      setupSummary: {
        enabledRoleRuleCount: 0,
        verificationPromptLive: false,
        lastCompletedSetupAt: null,
      },
      migrationJob: null,
    });
    expect(landingState).toBe('needs_attention');
  });

  it('shows the migration review state after analysis finishes', () => {
    mockSetupRouteQueries({
      setupJob: null,
      setupSummary: null,
      migrationJob: {
        job: {
          mode: 'adopt_existing_roles',
          status: 'waiting_for_user',
          currentPhase: 'enforced',
          blockingReason: null,
          sourceBotKey: 'legacy-bot',
          summary: {
            preferences: {
              unmatchedProductBehavior: 'ignore',
              cutoverStyle: 'parallel_run',
            },
          },
        },
        sources: [
          {
            id: 'source-1',
            sourceKey: 'existing-discord-state',
            displayName: 'Existing Discord state snapshot',
            status: 'connected',
          },
        ],
        roleMappings: [
          {
            id: 'mapping-1',
            sourceRoleName: 'Supporter',
            status: 'auto_matched',
            confidence: 1,
          },
        ],
      },
    });

    const Component = DashboardSetupRoute.options.component;
    if (!Component) {
      throw new Error('Dashboard setup route component is not defined');
    }

    render(<Component />);

    expect(screen.getByText('Ready to switch over')).toBeInTheDocument();
    expect(screen.getByText('Everything looks good')).toBeInTheDocument();
    expect(screen.queryByText('Running automatically')).not.toBeInTheDocument();
    expect(screen.getByText('Existing Discord state snapshot')).toBeInTheDocument();
    expect(screen.getByText('Migration choices')).toBeInTheDocument();
    expect(screen.getByText(/ignored for now/i)).toBeInTheDocument();
    expect(screen.getByText('Supporter')).toBeInTheDocument();
  });
});
