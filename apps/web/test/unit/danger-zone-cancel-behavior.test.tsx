import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  createLazyFileRoute: () => (options: unknown) => ({ options }),
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: vi.fn(() => vi.fn()),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  })),
}));

vi.mock('@/lib/dashboard', () => ({
  uninstallGuild: vi.fn(() => Promise.resolve()),
}));

import { DangerZonePanel } from '@/components/dashboard/panels/DangerZonePanel';

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: PropsWithChildren) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

describe('DangerZonePanel cancel navigation', () => {
  afterEach(() => cleanup());
  it('cancel on step 1 hides the confirmation card (goes to step 0)', () => {
    render(<DangerZonePanel guildId="guild-1" />, { wrapper: createWrapper() });

    // Enter step 1
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(screen.getByText('Warning: Disconnect Server')).toBeInTheDocument();

    // Cancel from step 1 → back to step 0 (card hidden)
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText('Warning: Disconnect Server')).not.toBeInTheDocument();
  });

  it('cancel on step 2 goes back to step 1 (not step 0)', () => {
    render(<DangerZonePanel guildId="guild-1" />, { wrapper: createWrapper() });

    // Step 0 → 1
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    expect(screen.getByText('Warning: Disconnect Server')).toBeInTheDocument();

    // Step 1 → 2
    fireEvent.click(screen.getByRole('button', { name: /i understand/i }));
    expect(screen.getByText('Delete Server Data')).toBeInTheDocument();

    // Cancel from step 2 → step 1
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByText('Warning: Disconnect Server')).toBeInTheDocument();
    expect(screen.queryByText('Delete Server Data')).not.toBeInTheDocument();
  });

  it('cancel on step 3 goes back to step 2 (not step 0)', () => {
    render(<DangerZonePanel guildId="guild-1" />, { wrapper: createWrapper() });

    // Step 0 → 1 → 2 → 3
    fireEvent.click(screen.getByRole('button', { name: /disconnect/i }));
    fireEvent.click(screen.getByRole('button', { name: /i understand/i }));
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByText('Final Confirmation')).toBeInTheDocument();

    // Cancel from step 3 → step 2
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.getByText('Delete Server Data')).toBeInTheDocument();
    expect(screen.queryByText('Final Confirmation')).not.toBeInTheDocument();
  });
});
