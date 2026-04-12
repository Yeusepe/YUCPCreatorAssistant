import { describe, expect, it } from 'vitest';
import {
  buildHyperdxNavigationPhases,
  getHyperdxSlowestNavigationPhase,
  type HyperdxNavigationSnapshot,
} from '@/lib/hyperdx';

function createSnapshot(
  overrides: Partial<HyperdxNavigationSnapshot> = {}
): HyperdxNavigationSnapshot {
  return {
    navigationType: 'navigate',
    redirectMs: 0,
    dnsMs: 6.4,
    connectionMs: 14.1,
    requestSentMs: 2.2,
    serverWaitMs: 842.3,
    responseDownloadMs: 18.5,
    browserProcessingMs: 430.2,
    domInteractiveMs: 1087.4,
    domContentLoadedMs: 1240.1,
    loadEventEndMs: 1314.2,
    totalMs: 1314.2,
    serverTiming: [],
    ...overrides,
  };
}

describe('dashboard navigation timing helpers', () => {
  it('turns a navigation snapshot into ordered phases', () => {
    const phases = buildHyperdxNavigationPhases(createSnapshot());

    expect(phases).toEqual([
      { name: 'dns', startMs: 0, endMs: 6.4, durationMs: 6.4 },
      { name: 'connection', startMs: 6.4, endMs: 20.5, durationMs: 14.1 },
      { name: 'request-sent', startMs: 20.5, endMs: 22.7, durationMs: 2.2 },
      { name: 'server-wait', startMs: 22.7, endMs: 865, durationMs: 842.3 },
      { name: 'response-download', startMs: 865, endMs: 883.5, durationMs: 18.5 },
      { name: 'browser-processing', startMs: 883.5, endMs: 1313.7, durationMs: 430.2 },
    ]);
  });

  it('identifies the slowest phase', () => {
    const slowestPhase = getHyperdxSlowestNavigationPhase(
      buildHyperdxNavigationPhases(createSnapshot())
    );

    expect(slowestPhase).toEqual({
      name: 'server-wait',
      startMs: 22.7,
      endMs: 865,
      durationMs: 842.3,
    });
  });

  it('returns null when there are no phases', () => {
    expect(
      getHyperdxSlowestNavigationPhase(
        buildHyperdxNavigationPhases(
          createSnapshot({
            dnsMs: 0,
            connectionMs: 0,
            requestSentMs: 0,
            serverWaitMs: 0,
            responseDownloadMs: 0,
            browserProcessingMs: 0,
          })
        )
      )
    ).toBeNull();
  });
});
