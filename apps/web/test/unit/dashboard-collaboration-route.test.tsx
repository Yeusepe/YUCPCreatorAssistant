import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  createLazyFileRoute: () => (options: unknown) => ({ options }),
}));

vi.mock('@/hooks/useDashboardShell', () => ({
  useDashboardShell: vi.fn(() => ({
    guilds: [],
    selectedGuild: undefined,
    viewer: {
      authUserId: 'user-123',
    },
  })),
}));

vi.mock('@/hooks/useDashboardSession', () => ({
  isDashboardAuthError: vi.fn(() => false),
  useDashboardSession: vi.fn(() => ({
    canRunPanelQueries: true,
    isAuthResolved: true,
    markSessionExpired: vi.fn(),
    status: 'active',
  })),
}));

vi.mock('@/lib/dashboard', async () => {
  const actual = await vi.importActual<typeof import('@/lib/dashboard')>('@/lib/dashboard');

  return {
    ...actual,
    createCollabInvite: vi.fn(),
    listCollabConnections: vi.fn(),
    listCollabConnectionsAsCollaborator: vi.fn(),
    listCollabInvites: vi.fn(),
    listCollabProviders: vi.fn(),
    removeCollabConnection: vi.fn(),
    removeCollabConnectionAsCollaborator: vi.fn(),
    revokeCollabInvite: vi.fn(),
  };
});

import * as dashboardApi from '@/lib/dashboard';
import { Route as CollaborationRoute } from '@/routes/_authenticated/dashboard/collaboration.lazy';

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('dashboard collaboration route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(dashboardApi.listCollabProviders).mockResolvedValue([]);
    vi.mocked(dashboardApi.listCollabInvites).mockResolvedValue([]);
    vi.mocked(dashboardApi.listCollabConnections).mockResolvedValue([]);
    vi.mocked(dashboardApi.listCollabConnectionsAsCollaborator).mockResolvedValue([
      {
        id: 'conn-1',
        ownerAuthUserId: 'owner-1',
        ownerDisplayName: 'Creator Store',
        provider: 'jinxxy',
        linkType: 'account',
        createdAt: Date.now() - 60_000,
      },
    ]);
    vi.mocked(dashboardApi.removeCollabConnectionAsCollaborator).mockResolvedValue({
      success: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('cancels store removal when the hold is released early', async () => {
    const Component = CollaborationRoute.options.component;
    if (!Component) {
      throw new Error('Collaboration route component is not defined');
    }

    render(<Component />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByText('Creator Store')).toBeInTheDocument());

    vi.useFakeTimers();
    const button = screen.getByRole('button', { name: /hold to remove creator store/i });
    fireEvent.pointerDown(button);
    await vi.advanceTimersByTimeAsync(400);
    fireEvent.pointerUp(button);
    await vi.advanceTimersByTimeAsync(700);

    expect(dashboardApi.removeCollabConnectionAsCollaborator).not.toHaveBeenCalled();
  });

  it('removes a collaborator store after holding the leave control', async () => {
    const Component = CollaborationRoute.options.component;
    if (!Component) {
      throw new Error('Collaboration route component is not defined');
    }

    render(<Component />, { wrapper: createWrapper() });

    await waitFor(() => expect(screen.getByText('Creator Store')).toBeInTheDocument());

    vi.useFakeTimers();
    const button = screen.getByRole('button', { name: /hold to remove creator store/i });
    fireEvent.pointerDown(button);
    await vi.advanceTimersByTimeAsync(950);
    await Promise.resolve();

    expect(dashboardApi.removeCollabConnectionAsCollaborator).toHaveBeenCalledWith(
      'user-123',
      'conn-1'
    );
  });
});
