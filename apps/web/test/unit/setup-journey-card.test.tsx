import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let mockRuntimeConfig = {
  automaticSetupEnabled: true,
  browserAuthBaseUrl: 'https://app.example.com',
  buildId: 'test-build',
};

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
}));

vi.mock('@/lib/runtimeConfig', () => ({
  useRuntimeConfig: () => mockRuntimeConfig,
}));

import { SetupJourneyCard } from '@/components/dashboard/panels/SetupJourneyCard';

describe('SetupJourneyCard', () => {
  beforeEach(() => {
    mockRuntimeConfig = {
      automaticSetupEnabled: true,
      browserAuthBaseUrl: 'https://app.example.com',
      buildId: 'test-build',
    };
  });

  it('does not render when automatic setup is disabled', () => {
    mockRuntimeConfig = {
      automaticSetupEnabled: false,
      browserAuthBaseUrl: 'https://app.example.com',
      buildId: 'test-build',
    };

    const { container } = render(<SetupJourneyCard />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText('Server setup')).not.toBeInTheDocument();
  });
});
