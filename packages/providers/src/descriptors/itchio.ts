import type { ProviderDescriptorInput } from '../types';

export const itchio = {
  providerKey: 'itchio',
  label: 'itch.io',
  category: 'commerce',
  status: 'active',
  docsUrl: 'https://itch.io/docs/api/serverside',
  emojiKey: 'GiftCard',
  addProductDescription: 'Pick a game from your connected itch.io account',
  creatorAuthModes: ['oauth'],
  buyerVerificationMethods: ['license_key'],
  capabilities: ['catalog_sync', 'reconciliation', 'license_verification', 'orders'],
  setupRequirements: ['oauth_client'],
  verificationMethods: ['license_key'],
  supportsCredentialLogin: false,
  supportsBuyerOAuthLink: false,
  supportsAutoDiscovery: true,
  licenseKey: {
    inputLabel: 'Download Key',
    placeholder: 'YWKse5jeAeuZ8w3a5qO2b2PId1sChw2B9b637w6z',
  },
  productInput: {
    label: 'itch.io Game ID',
    description: 'Select a game from your connected itch.io account.',
    placeholder: '123456',
    requiresConnection: true,
  },
} as const satisfies ProviderDescriptorInput;
