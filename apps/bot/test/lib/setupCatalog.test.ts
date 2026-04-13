import { describe, expect, it } from 'bun:test';
import {
  buildMigrationEmptyCatalogReason,
  summarizeSetupCatalogResults,
} from '../../src/lib/setupCatalog';

describe('setup catalog helpers', () => {
  it('explains when connected store sessions expired during migration analysis', () => {
    const summary = summarizeSetupCatalogResults([
      {
        provider: 'gumroad',
        products: [],
        error: 'session_expired',
      },
      {
        provider: 'jinxxy',
        products: [],
        error: 'session_expired',
      },
    ]);

    const reason = buildMigrationEmptyCatalogReason(summary);

    expect(reason).toContain('expired');
    expect(reason).toContain('Gumroad');
    expect(reason).toContain('Jinxxy');
    expect(reason).toContain('Reconnect');
  });

  it('explains when connected stores return no active products', () => {
    const summary = summarizeSetupCatalogResults([
      {
        provider: 'gumroad',
        products: [],
      },
    ]);

    const reason = buildMigrationEmptyCatalogReason(summary);

    expect(reason).toContain('active products');
    expect(reason).toContain('reconnect');
    expect(reason).toContain('already connected');
  });
});
