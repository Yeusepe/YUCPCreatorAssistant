import { describe, expect, it } from 'bun:test';

import {
  getYucpAliasPackageContract,
  normalizeYucpAliasPackageContract,
  YUCP_ALIAS_PACKAGE_IMPORTER_PACKAGES,
  YUCP_ALIAS_PACKAGE_INSTALL_STRATEGIES,
  YUCP_ALIAS_PACKAGE_KIND,
} from './yucpAliasPackageContract';

describe('normalizeYucpAliasPackageContract', () => {
  it('normalizes the shared alias package contract shape', () => {
    expect(
      normalizeYucpAliasPackageContract({
        kind: ' alias-v1 ',
        aliasId: ' creator-alias ',
        installStrategy: ' server-authorized ',
        importerPackage: ' com.yucp.importer ',
        minImporterVersion: ' 1.2.0 ',
        catalogProductIds: [' product-a ', 'product-b', 'product-a'],
        channel: ' stable ',
        ignored: true,
      })
    ).toEqual({
      kind: YUCP_ALIAS_PACKAGE_KIND,
      aliasId: 'creator-alias',
      installStrategy: YUCP_ALIAS_PACKAGE_INSTALL_STRATEGIES.serverAuthorized,
      importerPackage: YUCP_ALIAS_PACKAGE_IMPORTER_PACKAGES.importer,
      minImporterVersion: '1.2.0',
      catalogProductIds: ['product-a', 'product-b'],
      channel: 'stable',
    });
  });

  it('returns undefined when the contract is absent', () => {
    expect(normalizeYucpAliasPackageContract(undefined)).toBeUndefined();
  });

  it('throws when the contract uses an unsupported install strategy', () => {
    expect(() =>
      normalizeYucpAliasPackageContract({
        kind: 'alias-v1',
        aliasId: 'creator-alias',
        installStrategy: 'download-direct',
        importerPackage: 'com.yucp.importer',
      })
    ).toThrow('metadata.yucp.installStrategy must be "server-authorized"');
  });
});

describe('getYucpAliasPackageContract', () => {
  it('reads the contract from root package metadata', () => {
    expect(
      getYucpAliasPackageContract({
        yucp: {
          kind: 'alias-v1',
          aliasId: 'creator-alias',
          installStrategy: 'server-authorized',
          importerPackage: 'com.yucp.importer',
        },
      })
    ).toEqual({
      kind: YUCP_ALIAS_PACKAGE_KIND,
      aliasId: 'creator-alias',
      installStrategy: YUCP_ALIAS_PACKAGE_INSTALL_STRATEGIES.serverAuthorized,
      importerPackage: YUCP_ALIAS_PACKAGE_IMPORTER_PACKAGES.importer,
    });
  });
});
