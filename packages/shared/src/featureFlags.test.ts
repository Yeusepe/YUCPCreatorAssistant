import { describe, expect, it } from 'bun:test';
import { AUTOMATIC_SETUP_FEATURE_FLAG, isAutomaticSetupEnabled } from './featureFlags';

describe('automatic setup feature flag', () => {
  it('defaults to disabled when the env var is missing', () => {
    expect(isAutomaticSetupEnabled({})).toBe(false);
  });

  it('accepts common truthy flag values', () => {
    expect(isAutomaticSetupEnabled({ [AUTOMATIC_SETUP_FEATURE_FLAG]: 'true' })).toBe(true);
    expect(isAutomaticSetupEnabled({ [AUTOMATIC_SETUP_FEATURE_FLAG]: '1' })).toBe(true);
    expect(isAutomaticSetupEnabled({ [AUTOMATIC_SETUP_FEATURE_FLAG]: 'on' })).toBe(true);
  });

  it('treats falsey and unknown values as disabled', () => {
    expect(isAutomaticSetupEnabled({ [AUTOMATIC_SETUP_FEATURE_FLAG]: 'false' })).toBe(false);
    expect(isAutomaticSetupEnabled({ [AUTOMATIC_SETUP_FEATURE_FLAG]: 'off' })).toBe(false);
    expect(isAutomaticSetupEnabled({ [AUTOMATIC_SETUP_FEATURE_FLAG]: 'unexpected' })).toBe(false);
  });
});
