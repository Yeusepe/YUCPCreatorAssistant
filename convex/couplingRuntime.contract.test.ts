import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const httpSource = readFileSync(resolve(__dirname, './http.ts'), 'utf8');
const yucpLicensesSource = readFileSync(resolve(__dirname, './yucpLicenses.ts'), 'utf8');

describe('coupling runtime HTTP contract', () => {
  it('proxies runtime token issuance through the public API instead of brokering artifacts in Convex', () => {
    expect(httpSource).toContain("path: '/v1/runtime-artifacts/manifest'");
    expect(httpSource).toContain("proxyToPublicApi(request, '/v1/runtime-artifacts/manifest')");
    expect(httpSource).toContain("path: '/v1/licenses/runtime-package-token'");
    expect(httpSource).toContain("proxyToPublicApi(request, '/v1/licenses/runtime-package-token')");
    expect(httpSource).toContain("path: '/v1/licenses/coupling-job'");
    expect(httpSource).toContain("proxyToPublicApi(request, '/v1/licenses/coupling-job')");
    expect(httpSource).toContain("path: '/v1/licenses/protected-materialization-grant'");
    expect(httpSource).toContain(
      "proxyToPublicApi(request, '/v1/licenses/protected-materialization-grant')"
    );
  });

  it('no longer resolves coupling runtime artifacts directly inside Convex HTTP routes', () => {
    expect(httpSource).not.toContain('buildRuntimeArtifactDownloadUrl');
    expect(httpSource).not.toContain('fetchRuntimeArtifactManifest');
    expect(httpSource).not.toContain('signCouplingRuntimeJwt');
    expect(httpSource).not.toContain('signCouplingRuntimePackageJwt');
  });

  it('records trace issuance only from API-supplied runtime metadata', () => {
    expect(yucpLicensesSource).toContain('runtimeArtifactVersion: v.optional(v.string())');
    expect(yucpLicensesSource).toContain('runtimePlaintextSha256: v.optional(v.string())');
    expect(yucpLicensesSource).not.toContain("fetchRuntimeArtifactManifest('coupling-runtime')");
    expect(yucpLicensesSource).toContain('runtimeArtifactVersion: args.runtimeArtifactVersion');
    expect(yucpLicensesSource).toContain('runtimePlaintextSha256: args.runtimePlaintextSha256');
    expect(yucpLicensesSource).toContain('issueProtectedMaterializationGrantForApi = action({');
  });

  it('keeps legacy Convex download routes as public-API shims', () => {
    expect(httpSource).toContain("path: '/v1/licenses/runtime-package'");
    expect(httpSource).toContain("path: '/v1/licenses/coupling-runtime'");
    expect(httpSource).toContain("proxyToPublicApi(request, '/v1/licenses/runtime-package')");
    expect(httpSource).toContain("proxyToPublicApi(request, '/v1/licenses/coupling-runtime')");
  });

  it('treats the sealed grant itself as the public authorization for redeem and receipt', () => {
    expect(httpSource).toContain("path: '/v1/licenses/protected-materialization-redeem'");
    expect(httpSource).toContain("path: '/v1/licenses/protected-materialization-receipt'");
    expect(httpSource).not.toContain('Broker authorization is required');
  });
});
