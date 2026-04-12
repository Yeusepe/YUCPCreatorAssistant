import { describe, expect, it } from 'vitest';
import { routeStylesheetLinks } from '../../src/lib/routeStyles';

describe('routeStylesheetLinks', () => {
  it('removes Vite timestamp query parameters from route stylesheet hrefs', () => {
    expect(routeStylesheetLinks('/src/styles/dashboard-components.css?t=1776005360899')).toEqual([
      {
        rel: 'stylesheet',
        href: '/src/styles/dashboard-components.css',
        suppressHydrationWarning: true,
      },
    ]);
  });

  it('preserves non-timestamp query parameters', () => {
    expect(routeStylesheetLinks('/@tanstack-start/styles.css?routes=__root__')).toEqual([
      {
        rel: 'stylesheet',
        href: '/@tanstack-start/styles.css?routes=__root__',
        suppressHydrationWarning: true,
      },
    ]);
  });
});
