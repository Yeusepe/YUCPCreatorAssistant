import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
}));

import { useQuery } from 'convex/react';
import { StatsOverviewPanel } from '@/components/dashboard/panels/StatsOverviewPanel';

describe('StatsOverviewPanel loading presentation', () => {
  it('avoids the boxed card treatment while stats are still loading', () => {
    vi.mocked(useQuery).mockReturnValue(undefined);

    const { container } = render(<StatsOverviewPanel />);

    const section = container.querySelector('#stats-overview-section');
    expect(section).toBeTruthy();
    expect(section.className).toContain('stats-overview-panel');
    expect(section.className).toContain('stats-overview-panel--loading');
    expect(section.className).not.toContain('intg-card');
  });

  it('restores the standard integrated card once stats have loaded', () => {
    vi.mocked(useQuery).mockReturnValue({
      activeLicenses: 12,
      recent24h: 3,
      recent30d: 18,
      recent7d: 9,
      totalLicenses: 20,
      totalProducts: 5,
      totalVerified: 42,
    });

    const { container } = render(<StatsOverviewPanel />);

    const section = container.querySelector('#stats-overview-section');
    expect(section).toBeTruthy();
    expect(section.className).toContain('stats-overview-panel');
    expect(section.className).toContain('intg-card');
    expect(section.className).toContain('intg-card--flush');
    expect(section.className).not.toContain('stats-overview-panel--loading');
  });
});
