import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatCard } from '@/components/dashboard/cards/StatCard';

describe('StatCard loading state', () => {
  it('shows skeleton (aria-hidden) not the value "0" when loading', () => {
    const { container } = render(<StatCard label="Test" value={0} icon={null} loading={true} />);
    const hiddenEl = container.querySelector('[aria-hidden="true"]');
    expect(hiddenEl).not.toBeNull();
    const valueEl = container.querySelector('.stat-cell-value');
    expect(valueEl).toBeNull();
  });

  it('shows value "42" when not loading', () => {
    const { container } = render(<StatCard label="Test" value={42} icon={null} loading={false} />);
    const valueEl = container.querySelector('.stat-cell-value');
    expect(valueEl?.textContent).toBe('42');
  });

  it('shows value "0" correctly when not loading and value is genuinely 0', () => {
    const { container } = render(
      <StatCard label="Verified Members" value={0} icon={null} loading={false} />
    );
    const valueEl = container.querySelector('.stat-cell-value');
    expect(valueEl?.textContent).toBe('0');
  });
});
