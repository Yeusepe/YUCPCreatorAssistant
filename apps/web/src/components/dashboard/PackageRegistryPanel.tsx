import {
  Button,
  Card,
  Chip,
  ListBox,
  ScrollShadow,
  Select,
  Separator,
  TextArea,
  Tooltip,
} from '@heroui/react';
import { DropZone, EmptyState, Sheet } from '@heroui-pro/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Archive,
  ArrowUpFromLine,
  Copy,
  ExternalLink,
  FolderUp,
  Package2,
  Pencil,
  RefreshCcw,
  ShieldCheck,
  Store,
  Trash2,
} from 'lucide-react';
import type { ComponentPropsWithoutRef, Key, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { AccountInlineError } from '@/components/account/AccountPage';
import { StatusChip } from '@/components/ui/StatusChip';
import { useToast } from '@/components/ui/Toast';
import { YucpButton } from '@/components/ui/YucpButton';
import { YucpInput } from '@/components/ui/YucpInput';
import { isDashboardAuthError, useDashboardSession } from '@/hooks/useDashboardSession';
import { getAccountProviderIconPath } from '@/lib/account';
import {
  archiveCreatorPackage,
  type CreatorBackstageProductPackageSummary,
  type CreatorBackstageProductSummary,
  type CreatorPackageListResponse,
  type CreatorPackageSummary,
  createBackstageReleaseUploadUrl,
  deleteCreatorPackage,
  listCreatorBackstageProducts,
  listCreatorPackages,
  publishBackstageRelease,
  renameCreatorPackage,
  requestBackstageRepoAccess,
  restoreCreatorPackage,
  uploadBackstageReleaseFile,
} from '@/lib/packages';
import { copyToClipboard } from '@/lib/utils';

interface PackageRegistryPanelProps {
  className?: string;
  description?: string;
  title?: string;
}

type PublishDraft = {
  catalogProductIds: string[];
  laneKey: string;
  packageId: string;
  version: string;
  channel: string;
  displayName: string;
  description: string;
  repositoryVisibility: 'hidden' | 'listed';
  unityVersion: string;
};

type SelectedUpload = {
  artifactKind: 'unitypackage' | 'zip';
  contentType: string;
  file: File;
  status: 'ready' | 'uploading' | 'complete' | 'failed';
  errorMessage?: string;
};

type ProductLane = {
  catalogProductIds: string[];
  laneKey: string;
  packageLinks: CreatorBackstageProductPackageSummary[];
  primaryPackage: CreatorBackstageProductPackageSummary | null;
  products: CreatorBackstageProductSummary[];
  providerLabels: string[];
  providerRefs: string[];
  title: string;
};

const creatorPackagesQueryKey = ['creator-packages'] as const;
const creatorBackstageProductsQueryKey = ['creator-backstage-products'] as const;
const creatorBackstageRepoAccessQueryKey = ['creator-backstage-repo-access'] as const;
const UNITYPACKAGE_ACCEPT_VALUE = '.unitypackage,.zip,application/octet-stream,application/zip';

function joinClassNames(...values: Array<string | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function getBackstageArtifactKind(fileName: string): SelectedUpload['artifactKind'] | null {
  const normalized = fileName.trim().toLowerCase();
  if (normalized.endsWith('.unitypackage')) {
    return 'unitypackage';
  }
  if (normalized.endsWith('.zip')) {
    return 'zip';
  }
  return null;
}

function getBackstageArtifactContentType(
  file: Pick<File, 'name' | 'type'>,
  artifactKind: SelectedUpload['artifactKind']
): string {
  const normalizedType = file.type.trim();
  if (normalizedType) {
    return normalizedType;
  }
  return artifactKind === 'unitypackage' ? 'application/octet-stream' : 'application/zip';
}

function updatePackageListCache(
  cached: CreatorPackageListResponse | undefined,
  packageId: string,
  updater: (pkg: CreatorPackageSummary) => CreatorPackageSummary
): CreatorPackageListResponse | undefined {
  if (!cached) {
    return cached;
  }

  return {
    ...cached,
    packages: cached.packages.map((pkg) => (pkg.packageId === packageId ? updater(pkg) : pkg)),
  };
}

function formatRelativeTime(timestamp: number): string {
  const diffMs = Date.now() - timestamp;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;
  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return new Date(timestamp).toLocaleDateString(undefined, { year: 'numeric', month: 'short' });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatProviderLabel(provider: string): string {
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

function mapUploadStatus(status: SelectedUpload['status']): 'complete' | 'failed' | 'uploading' {
  if (status === 'failed') return 'failed';
  if (status === 'uploading') return 'uploading';
  return 'complete';
}

function getPrimaryBackstagePackage(product: CreatorBackstageProductSummary) {
  return product.backstagePackages[0] ?? null;
}

function normalizeComparableText(value?: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildProductLaneKey(product: CreatorBackstageProductSummary): string {
  const normalizedSlug = normalizeComparableText(product.canonicalSlug);
  if (normalizedSlug) {
    return `slug:${normalizedSlug}`;
  }

  const normalizedAlias = (product.aliases ?? []).map(normalizeComparableText).find(Boolean);
  if (normalizedAlias) {
    return `alias:${normalizedAlias}`;
  }

  const normalizedDisplayName = normalizeComparableText(product.displayName);
  if (normalizedDisplayName) {
    return `display:${normalizedDisplayName}`;
  }

  return `product:${normalizeComparableText(product.productId)}`;
}

function compareBackstagePackageLinks(
  left: CreatorBackstageProductPackageSummary,
  right: CreatorBackstageProductPackageSummary
): number {
  const leftLabel = (left.displayName ?? left.packageName ?? left.packageId).toLowerCase();
  const rightLabel = (right.displayName ?? right.packageName ?? right.packageId).toLowerCase();
  return leftLabel.localeCompare(rightLabel) || left.packageId.localeCompare(right.packageId);
}

function buildProductLanes(products: CreatorBackstageProductSummary[]): ProductLane[] {
  const groupedProducts = new Map<string, CreatorBackstageProductSummary[]>();
  for (const product of products) {
    const laneKey = buildProductLaneKey(product);
    const existingProducts = groupedProducts.get(laneKey) ?? [];
    existingProducts.push(product);
    groupedProducts.set(laneKey, existingProducts);
  }

  return Array.from(groupedProducts.entries())
    .map(([laneKey, laneProducts]) => {
      const primaryTitle =
        laneProducts.find((product) => product.displayName?.trim())?.displayName?.trim() ??
        laneProducts[0]?.productId ??
        'Untitled product';
      const packageLinks = Array.from(
        new Map(
          laneProducts
            .flatMap((product) => product.backstagePackages)
            .map((backstagePackage) => [backstagePackage.packageId, backstagePackage])
        ).values()
      ).sort(compareBackstagePackageLinks);
      const providerLabels = Array.from(
        new Map(
          laneProducts.map((product) => [product.provider, formatProviderLabel(product.provider)])
        ).values()
      );
      const providerRefs = laneProducts.map(
        (product) => `${formatProviderLabel(product.provider)} · ${product.providerProductRef}`
      );

      return {
        catalogProductIds: laneProducts.map((product) => product.catalogProductId),
        laneKey,
        packageLinks,
        primaryPackage: packageLinks.length === 1 ? packageLinks[0] : null,
        products: [...laneProducts].sort((left, right) =>
          formatProviderLabel(left.provider).localeCompare(formatProviderLabel(right.provider))
        ),
        providerLabels,
        providerRefs,
        title: primaryTitle,
      };
    })
    .sort((left, right) => left.title.localeCompare(right.title));
}

function buildDraftFromLane(lane?: ProductLane | null): PublishDraft {
  const linkedPackage = lane?.primaryPackage ?? null;
  return {
    catalogProductIds: lane?.catalogProductIds ?? [],
    laneKey: lane?.laneKey ?? '',
    packageId: linkedPackage?.packageId ?? '',
    version: '',
    channel: linkedPackage?.defaultChannel ?? 'stable',
    displayName: linkedPackage?.displayName ?? lane?.title ?? '',
    description: '',
    repositoryVisibility: linkedPackage?.repositoryVisibility ?? 'listed',
    unityVersion: '',
  };
}

function StreamlineUploadBoxIcon(props: ComponentPropsWithoutRef<'svg'>) {
  const { className, ...restProps } = props;
  return (
    <svg
      fill="none"
      viewBox="0 0 14 14"
      className={joinClassNames('text-accent', className)}
      {...restProps}
    >
      <path
        fill="currentColor"
        opacity="0.94"
        d="M13.234 3.875H0.766c0.036 -0.14 0.107 -0.277 0.175 -0.407l0.05 -0.098c0.132 -0.264 0.33 -0.627 0.593 -1.022 0.522 -0.783 1.331 -1.74 2.443 -2.295A0.5 0.5 0 0 1 4.25 0l5.5 0a0.5 0.5 0 0 1 0.224 0.053c1.111 0.556 1.92 1.512 2.442 2.295 0.264 0.395 0.462 0.758 0.594 1.022 0.082 0.164 0.165 0.33 0.224 0.505Z"
      />
      <path
        fill="currentColor"
        opacity="0.3"
        fillRule="evenodd"
        d="M13.234 3.875H7.625V0l-1.25 0v3.875H0.766l-0.001 0.004C0.07 6.659 0.311 9.424 0.539 10.927c0.144 0.947 0.97 1.573 1.882 1.573l2.454 0v-0.598a2.22 2.22 0 0 1 -0.97 -0.423 2.18 2.18 0 0 1 -0.715 -2.52c0.284 -0.745 0.808 -1.36 1.327 -1.8 0.531 -0.45 1.22 -0.856 1.996 -1.05 0.32 -0.08 0.654 -0.08 0.973 0 0.776 0.194 1.465 0.6 1.997 1.05 0.52 0.44 1.043 1.055 1.327 1.8a2.18 2.18 0 0 1 -0.715 2.52 2.22 2.22 0 0 1 -0.97 0.423v0.598l2.454 0c0.912 0 1.738 -0.626 1.882 -1.573 0.229 -1.503 0.47 -4.267 -0.226 -7.048l-0.001 -0.004Z"
        clipRule="evenodd"
      />
      <path
        fill="currentColor"
        opacity="0.78"
        fillRule="evenodd"
        d="M4.358 9.405a0.93 0.93 0 0 0 0.304 1.08c0.28 0.213 0.648 0.255 0.967 0.132 0.142 -0.055 0.312 -0.113 0.496 -0.163l0 2.671a0.875 0.875 0 1 0 1.75 0l0 -2.67c0.184 0.05 0.354 0.107 0.495 0.162 0.32 0.122 0.688 0.08 0.967 -0.132a0.93 0.93 0 0 0 0.305 -1.08c-0.187 -0.492 -0.555 -0.943 -0.967 -1.292 -0.417 -0.353 -0.938 -0.653 -1.492 -0.791a0.756 0.756 0 0 0 -0.367 0c-0.553 0.138 -1.074 0.438 -1.49 0.791 -0.413 0.35 -0.781 0.8 -0.968 1.292Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StreamlineLinkChainIcon(props: ComponentPropsWithoutRef<'svg'>) {
  const { className, ...restProps } = props;
  return (
    <svg
      fill="none"
      viewBox="0 0 14 14"
      className={joinClassNames('text-primary', className)}
      {...restProps}
    >
      <path
        fill="currentColor"
        opacity="0.78"
        fillRule="evenodd"
        d="M12.399 1.601C11.197 0.4 9.874 0.041 8.504 0.361c-1.289 0.3 -2.54 1.181 -3.734 2.233a0.75 0.75 0 0 0 0.99 1.126C6.92 2.7 7.936 2.033 8.844 1.822c0.825 -0.193 1.628 -0.026 2.494 0.84 0.86 0.86 1.03 1.656 0.846 2.472 -0.202 0.896 -0.85 1.9 -1.852 3.046a0.75 0.75 0 0 0 1.129 0.988c1.035 -1.185 1.898 -2.426 2.186 -3.705 0.306 -1.36 -0.057 -2.67 -1.248 -3.862ZM9.388 4.613a0.75 0.75 0 0 1 0 1.06L5.673 9.388a0.75 0.75 0 0 1 -1.06 -1.06l3.714 -3.715a0.75 0.75 0 0 1 1.061 0Zm-5.79 0.148a0.75 0.75 0 0 1 0.07 1.059c-1.001 1.145 -1.65 2.15 -1.851 3.046 -0.184 0.816 -0.015 1.612 0.845 2.472 0.866 0.866 1.669 1.033 2.494 0.84 0.908 -0.211 1.925 -0.877 3.083 -1.898a0.75 0.75 0 1 1 0.991 1.126c-1.194 1.052 -2.445 1.933 -3.733 2.233 -1.371 0.32 -2.693 -0.038 -3.896 -1.24C0.411 11.208 0.047 9.898 0.353 8.537c0.288 -1.28 1.15 -2.52 2.186 -3.705a0.75 0.75 0 0 1 1.059 -0.07Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StreamlineShippingBoxIcon(props: ComponentPropsWithoutRef<'svg'>) {
  const { className, ...restProps } = props;
  return (
    <svg
      fill="none"
      viewBox="0 0 14 14"
      className={joinClassNames('text-accent', className)}
      {...restProps}
    >
      <path
        fill="currentColor"
        opacity="0.3"
        d="M11.71 2.314a18.695 18.695 0 0 1 -0.64 -1.28 1.066 1.066 0 0 0 -0.888 -0.63A35.212 35.212 0 0 0 7 0.256c-1.269 0 -2.148 0.06 -3.211 0.149a1.054 1.054 0 0 0 -0.868 0.596c-0.17 0.365 -0.363 0.73 -0.559 1.099 -0.395 0.75 -0.802 1.91 -1.06 2.743 0.17 -0.25 0.46 -0.423 0.795 -0.446 0.294 -0.021 0.592 -0.044 0.891 -0.067 1.296 -0.098 2.638 -0.2 4.012 -0.2 1.374 0 2.716 0.102 4.011 0.2 0.3 0.023 0.597 0.046 0.892 0.067 0.333 0.023 0.623 0.194 0.793 0.444 -0.268 -0.792 -0.633 -1.866 -0.986 -2.528Z"
      />
      <path
        fill="currentColor"
        opacity="0.94"
        fillRule="evenodd"
        d="m6.376 4.139 -0.001 -0.033V0.262C5.422 0.28 4.669 0.333 3.788 0.406a1.054 1.054 0 0 0 -0.867 0.596c-0.17 0.365 -0.363 0.73 -0.559 1.1 -0.395 0.749 -0.802 1.91 -1.06 2.742 0.17 -0.25 0.46 -0.422 0.794 -0.446l0.892 -0.066c1.099 -0.084 2.23 -0.17 3.388 -0.193Zm1.248 0c1.157 0.024 2.288 0.11 3.387 0.193l0.892 0.066c0.333 0.024 0.623 0.194 0.793 0.444l-0.001 -0.005c-0.269 -0.791 -0.632 -1.862 -0.985 -2.523a18.648 18.648 0 0 1 -0.64 -1.28 1.066 1.066 0 0 0 -0.888 -0.63A36.971 36.971 0 0 0 7.625 0.261v3.844l-0.001 0.033Z"
        clipRule="evenodd"
      />
      <path
        fill="currentColor"
        opacity="0.4"
        d="M1.155 11.994c0.074 0.496 0.464 0.879 0.941 0.917 1.569 0.127 3.211 0.302 4.904 0.302 1.692 0 3.335 -0.175 4.903 -0.302 0.477 -0.038 0.867 -0.42 0.94 -0.917 0.162 -1.084 0.355 -2.214 0.355 -3.376 0 -1.163 -0.193 -2.293 -0.354 -3.377 -0.074 -0.496 -0.464 -0.878 -0.941 -0.917 -1.568 -0.127 -3.211 -0.302 -4.903 -0.302 -1.693 0 -3.335 0.175 -4.904 0.302 -0.477 0.039 -0.867 0.42 -0.94 0.917C0.993 6.325 0.801 7.455 0.801 8.618c0 1.162 0.192 2.292 0.353 3.376Z"
      />
      <path
        fill="currentColor"
        opacity="0.82"
        fillRule="evenodd"
        d="M8.067 10.575c0 -0.345 0.28 -0.625 0.625 -0.625h2.021a0.625 0.625 0 0 1 0 1.25h-2.02a0.625 0.625 0 0 1 -0.626 -0.625Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StreamlineArchiveBoxIcon(props: ComponentPropsWithoutRef<'svg'>) {
  const { className, ...restProps } = props;
  return (
    <svg
      fill="none"
      viewBox="0 0 14 14"
      className={joinClassNames('text-primary', className)}
      {...restProps}
    >
      <path
        fill="currentColor"
        opacity="0.32"
        fillRule="evenodd"
        d="M1.55 5.381c0.157 0.05 0.32 0.073 0.482 0.07 2.352 -0.04 4.722 -0.023 7.137 -0.006 1.044 0.007 2.096 0.015 3.158 0.017 0.048 0 0.096 -0.002 0.144 -0.006 0.024 0.073 0.043 0.15 0.056 0.228a19.45 19.45 0 0 1 0.262 3.144 19.96 19.96 0 0 1 -0.283 3.227 1.467 1.467 0 0 1 -1.289 1.219c-1.352 0.15 -2.757 0.25 -4.217 0.25 -1.198 0 -2.37 -0.108 -3.476 -0.21l-0.002 0c-0.235 -0.022 -0.467 -0.044 -0.696 -0.063a1.483 1.483 0 0 1 -1.344 -1.221 19.34 19.34 0 0 1 -0.013 -6.358c0.017 -0.102 0.044 -0.2 0.08 -0.29Z"
        clipRule="evenodd"
      />
      <path
        fill="currentColor"
        opacity="0.94"
        fillRule="evenodd"
        d="M4.933 8.11c0 -0.345 0.28 -0.624 0.625 -0.624h2.884a0.625 0.625 0 1 1 0 1.25H5.558a0.625 0.625 0 0 1 -0.625 -0.625Z"
        clipRule="evenodd"
      />
      <path
        fill="currentColor"
        opacity="0.74"
        fillRule="evenodd"
        d="M7 0.77c-1.815 0 -3.582 0.044 -5.25 0.124 -0.497 0.024 -1.016 0.304 -1.225 0.843A4.03 4.03 0 0 0 0.25 3.193c0 0.48 0.093 0.94 0.254 1.38 0.218 0.594 0.8 0.888 1.347 0.879 2.352 -0.04 4.723 -0.024 7.137 -0.007 1.045 0.007 2.097 0.015 3.159 0.017 0.56 0.002 1.13 -0.315 1.343 -0.902a4 4 0 0 0 0.26 -1.367c0 -0.499 -0.102 -0.98 -0.274 -1.433 -0.208 -0.548 -0.732 -0.842 -1.245 -0.865A112.353 112.353 0 0 0 7 0.77Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function StatCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <Card className="rounded-[24px] border border-border/70 bg-surface/90 shadow-none">
      <Card.Content className="flex items-start justify-between gap-4 p-5">
        <div className="space-y-2">
          <p className="text-muted text-xs font-medium tracking-[0.12em] uppercase">{label}</p>
          <p className="text-foreground text-3xl font-semibold tabular-nums">{value}</p>
          <p className="text-muted text-sm">{detail}</p>
        </div>
        <div className="bg-surface-secondary text-foreground flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/60">
          {icon}
        </div>
      </Card.Content>
    </Card>
  );
}

function IconActionButton({
  label,
  onPress,
  isDisabled,
  children,
}: {
  label: string;
  onPress: () => void;
  isDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip delay={0}>
      <Button
        isIconOnly
        aria-label={label}
        isDisabled={isDisabled}
        size="sm"
        variant="ghost"
        onPress={onPress}
      >
        {children}
      </Button>
      <Tooltip.Content>{label}</Tooltip.Content>
    </Tooltip>
  );
}

function ProductLaneCard({
  lane,
  onPublish,
}: {
  lane: ProductLane;
  onPublish: (lane: ProductLane) => void;
}) {
  const linkedPackage = lane.primaryPackage;
  const providerIconPath = getAccountProviderIconPath(lane.products[0]?.provider);
  const hasPackageConflict = lane.packageLinks.length > 1;
  const storefrontCount = lane.products.length;
  const storefrontLabel = `${storefrontCount} storefront${storefrontCount === 1 ? '' : 's'}`;

  return (
    <Card className="rounded-[24px] border border-border/70 bg-surface/95 shadow-none">
      <Card.Content className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 gap-4">
          <div className="bg-surface-secondary flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border/60">
            {providerIconPath ? (
              <img
                src={providerIconPath}
                alt=""
                aria-hidden="true"
                className="size-7 object-contain"
              />
            ) : (
              <Store className="size-5" />
            )}
          </div>
          <div className="min-w-0 space-y-3">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-foreground min-w-0 text-base font-semibold leading-6">
                  {lane.title}
                </p>
                <Chip size="sm" variant="soft">
                  {storefrontLabel}
                </Chip>
                {lane.providerLabels.map((providerLabel) => (
                  <Chip key={providerLabel} size="sm" variant="soft">
                    {providerLabel}
                  </Chip>
                ))}
              </div>
              <p className="text-muted text-sm leading-6">
                {storefrontCount > 1
                  ? 'Mirrored storefront records now share one release lane so one publish can update every matching store listing.'
                  : (lane.providerRefs[0] ?? 'Catalog product reference unavailable')}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {hasPackageConflict ? (
                <>
                  <Chip color="warning" size="sm" variant="soft">
                    Multiple package IDs linked
                  </Chip>
                  {lane.packageLinks.map((packageLink) => (
                    <Chip key={packageLink.packageId} size="sm" variant="soft">
                      {packageLink.displayName ?? packageLink.packageName ?? packageLink.packageId}
                    </Chip>
                  ))}
                </>
              ) : linkedPackage ? (
                <>
                  <Chip size="sm" variant="soft">
                    {linkedPackage.displayName ??
                      linkedPackage.packageName ??
                      linkedPackage.packageId}
                  </Chip>
                  <Chip size="sm" variant="soft">
                    {linkedPackage.latestPublishedVersion
                      ? `v${linkedPackage.latestPublishedVersion}`
                      : 'Version pending'}
                  </Chip>
                  <Chip size="sm" variant="soft">
                    {linkedPackage.repositoryVisibility === 'listed' ? 'Listed' : 'Hidden'}
                  </Chip>
                </>
              ) : (
                <Chip size="sm" variant="soft">
                  No package linked yet
                </Chip>
              )}
            </div>
            <p className="text-muted max-w-[68ch] text-sm leading-6">
              {hasPackageConflict
                ? 'This lane is split across different package IDs today. Publishing from here will relink every mirrored storefront to the package you choose.'
                : linkedPackage
                  ? 'Subscribers resolve the latest linked package version from this lane.'
                  : 'Link a package identity and publish the first release to make this product installable through the repo.'}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-3 lg:items-end">
          <StatusChip
            status={
              hasPackageConflict
                ? 'pending'
                : linkedPackage?.latestRelease?.releaseStatus === 'published'
                  ? 'active'
                  : 'pending'
            }
            label={
              hasPackageConflict
                ? 'Needs relink'
                : linkedPackage?.latestRelease?.releaseStatus === 'published'
                  ? 'Published'
                  : 'Needs release'
            }
          />
          <Button
            className="w-full lg:w-auto"
            size="sm"
            variant="outline"
            onPress={() => onPublish(lane)}
          >
            <ArrowUpFromLine className="size-4" />
            Publish release
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}

function PackageRegistryItem({
  pkg,
  isEditing,
  editName,
  isSaving,
  isDeleting,
  isArchiving,
  isRestoring,
  onEditStart,
  onEditCancel,
  onEditChange,
  onSave,
  onArchive,
  onRestore,
  onDelete,
  onCopyId,
}: {
  pkg: CreatorPackageSummary;
  isEditing: boolean;
  editName: string;
  isSaving: boolean;
  isDeleting: boolean;
  isArchiving: boolean;
  isRestoring: boolean;
  onEditStart: () => void;
  onEditCancel: () => void;
  onEditChange: (value: string) => void;
  onSave: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onCopyId: () => void;
}) {
  const archived = pkg.status === 'archived';
  const busy = isSaving || isDeleting || isArchiving || isRestoring;
  const nameChanged = editName.trim() !== (pkg.packageName ?? '').trim();

  return (
    <Card className="rounded-[24px] border border-border/70 bg-surface/95 shadow-none">
      <Card.Content className="grid gap-4 p-5 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 gap-4">
          <div className="bg-surface-secondary flex size-14 shrink-0 items-center justify-center rounded-2xl border border-border/60">
            {archived ? (
              <StreamlineArchiveBoxIcon className="size-8" />
            ) : (
              <StreamlineShippingBoxIcon className="size-8" />
            )}
          </div>
          <div className="min-w-0 space-y-3">
            {isEditing ? (
              <div className="w-full space-y-3">
                <YucpInput
                  aria-label="Package name"
                  value={editName}
                  autoFocus
                  isDisabled={isSaving}
                  onValueChange={onEditChange}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    className="max-w-full break-all font-mono text-[11px]"
                    size="sm"
                    variant="soft"
                  >
                    {pkg.packageId}
                  </Chip>
                  <Chip size="sm" variant="soft">
                    Updated {formatRelativeTime(pkg.updatedAt)}
                  </Chip>
                </div>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <p className="text-foreground text-base font-semibold leading-6">
                    {pkg.packageName || 'Unnamed package'}
                  </p>
                  <p className="text-muted text-sm leading-6">
                    Stable package identity for Unity exports and Backstage publishing.
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    className="max-w-full break-all font-mono text-[11px]"
                    size="sm"
                    variant="soft"
                  >
                    {pkg.packageId}
                  </Chip>
                  <Chip size="sm" variant="soft">
                    Updated {formatRelativeTime(pkg.updatedAt)}
                  </Chip>
                  <Chip color={archived ? 'default' : 'success'} size="sm" variant="soft">
                    {archived ? 'Archived' : 'Active'}
                  </Chip>
                </div>
                {pkg.deleteBlockedReason ? (
                  <p className="text-muted max-w-[68ch] text-xs leading-5">
                    {pkg.deleteBlockedReason}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-start gap-1 lg:justify-end">
          {isEditing ? (
            <>
              <IconActionButton
                label={isSaving ? 'Saving name' : 'Save package name'}
                isDisabled={!nameChanged || isSaving}
                onPress={onSave}
              >
                {isSaving ? (
                  <span className="btn-loading-spinner" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="size-4" />
                )}
              </IconActionButton>
              <IconActionButton label="Cancel edit" isDisabled={isSaving} onPress={onEditCancel}>
                <RefreshCcw className="size-4" />
              </IconActionButton>
            </>
          ) : (
            <>
              <IconActionButton label="Copy package ID" onPress={onCopyId}>
                <Copy className="size-4" />
              </IconActionButton>
              {!archived ? (
                <IconActionButton label="Rename package" isDisabled={busy} onPress={onEditStart}>
                  <Pencil className="size-4" />
                </IconActionButton>
              ) : null}
              {archived ? (
                <IconActionButton
                  label={isRestoring ? 'Restoring package' : 'Restore package'}
                  isDisabled={busy || !pkg.canRestore}
                  onPress={onRestore}
                >
                  {isRestoring ? (
                    <span className="btn-loading-spinner" aria-hidden="true" />
                  ) : (
                    <RefreshCcw className="size-4" />
                  )}
                </IconActionButton>
              ) : (
                <IconActionButton
                  label={isArchiving ? 'Archiving package' : 'Archive package'}
                  isDisabled={busy || !pkg.canArchive}
                  onPress={onArchive}
                >
                  {isArchiving ? (
                    <span className="btn-loading-spinner" aria-hidden="true" />
                  ) : (
                    <Archive className="size-4" />
                  )}
                </IconActionButton>
              )}
              <IconActionButton
                label={isDeleting ? 'Deleting package' : 'Delete package'}
                isDisabled={busy || !pkg.canDelete}
                onPress={onDelete}
              >
                {isDeleting ? (
                  <span className="btn-loading-spinner" aria-hidden="true" />
                ) : (
                  <Trash2 className="text-danger size-4" />
                )}
              </IconActionButton>
            </>
          )}
        </div>
      </Card.Content>
    </Card>
  );
}

export function PackageRegistryPanel({
  className = 'intg-card bento-col-12',
  description = 'Manually publish Backstage releases, keep package IDs stable, and manage the repo links your subscribers install through VCC.',
  title = 'Backstage Files',
}: PackageRegistryPanelProps) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { canRunPanelQueries, markSessionExpired } = useDashboardSession();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [pendingSaveId, setPendingSaveId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [pendingRestoreId, setPendingRestoreId] = useState<string | null>(null);
  const [isArchivedExpanded, setIsArchivedExpanded] = useState(false);
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isAdvancedPublishOptionsOpen, setIsAdvancedPublishOptionsOpen] = useState(false);
  const [publishDraft, setPublishDraft] = useState<PublishDraft>(() => buildDraftFromLane(null));
  const [selectedUpload, setSelectedUpload] = useState<SelectedUpload | null>(null);

  const packagesQuery = useQuery({
    queryKey: creatorPackagesQueryKey,
    queryFn: () => listCreatorPackages({ includeArchived: true }),
    enabled: canRunPanelQueries,
    retry: false,
  });

  const productsQuery = useQuery({
    queryKey: creatorBackstageProductsQueryKey,
    queryFn: listCreatorBackstageProducts,
    enabled: canRunPanelQueries,
    retry: false,
  });

  const repoAccessQuery = useQuery({
    queryKey: creatorBackstageRepoAccessQueryKey,
    queryFn: requestBackstageRepoAccess,
    enabled: canRunPanelQueries,
    retry: false,
  });

  useEffect(() => {
    const candidateError = packagesQuery.error ?? productsQuery.error ?? repoAccessQuery.error;
    if (isDashboardAuthError(candidateError)) {
      markSessionExpired();
    }
  }, [markSessionExpired, packagesQuery.error, productsQuery.error, repoAccessQuery.error]);

  const renameMutation = useMutation({
    mutationFn: renameCreatorPackage,
    onMutate: ({ packageId }) => setPendingSaveId(packageId),
    onSuccess: async () => {
      setEditingId(null);
      await queryClient.invalidateQueries({ queryKey: creatorPackagesQueryKey });
      toast.success('Package name saved');
    },
    onError: (error) => {
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      toast.error('Could not save package name');
    },
    onSettled: () => setPendingSaveId(null),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCreatorPackage,
    onMutate: ({ packageId }) => setPendingDeleteId(packageId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: creatorPackagesQueryKey }),
        queryClient.invalidateQueries({ queryKey: creatorBackstageProductsQueryKey }),
      ]);
      toast.success('Package removed');
    },
    onError: (error) => {
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'This package could not be removed.';
      toast.error('Could not remove package', { description: errorMessage });
    },
    onSettled: () => setPendingDeleteId(null),
  });

  const archiveMutation = useMutation({
    mutationFn: archiveCreatorPackage,
    onMutate: async ({ packageId }) => {
      setPendingArchiveId(packageId);
      await queryClient.cancelQueries({ queryKey: creatorPackagesQueryKey });
      const previousPackages =
        queryClient.getQueryData<CreatorPackageListResponse>(creatorPackagesQueryKey);
      queryClient.setQueryData<CreatorPackageListResponse | undefined>(
        creatorPackagesQueryKey,
        (current) =>
          updatePackageListCache(current, packageId, (pkg) => ({
            ...pkg,
            status: 'archived',
            archivedAt: Date.now(),
            canArchive: false,
            canRestore: true,
          }))
      );
      return { previousPackages };
    },
    onSuccess: () => {
      toast.success('Package archived');
    },
    onError: (error, _variables, context) => {
      if (context?.previousPackages) {
        queryClient.setQueryData(creatorPackagesQueryKey, context.previousPackages);
      }
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'This package could not be archived.';
      toast.error('Could not archive package', { description: errorMessage });
    },
    onSettled: () => setPendingArchiveId(null),
  });

  const restoreMutation = useMutation({
    mutationFn: restoreCreatorPackage,
    onMutate: async ({ packageId }) => {
      setPendingRestoreId(packageId);
      await queryClient.cancelQueries({ queryKey: creatorPackagesQueryKey });
      const previousPackages =
        queryClient.getQueryData<CreatorPackageListResponse>(creatorPackagesQueryKey);
      queryClient.setQueryData<CreatorPackageListResponse | undefined>(
        creatorPackagesQueryKey,
        (current) =>
          updatePackageListCache(current, packageId, (pkg) => ({
            ...pkg,
            status: 'active',
            archivedAt: undefined,
            canArchive: true,
            canRestore: false,
          }))
      );
      return { previousPackages };
    },
    onSuccess: () => {
      toast.success('Package restored');
    },
    onError: (error, _variables, context) => {
      if (context?.previousPackages) {
        queryClient.setQueryData(creatorPackagesQueryKey, context.previousPackages);
      }
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      const errorMessage =
        error instanceof Error ? error.message : 'This package could not be restored.';
      toast.error('Could not restore package', { description: errorMessage });
    },
    onSettled: () => setPendingRestoreId(null),
  });

  const publishMutation = useMutation({
    mutationFn: async (draft: PublishDraft) => {
      if (!selectedUpload?.file) {
        throw new Error('Choose a ZIP before publishing.');
      }

      setSelectedUpload((current) =>
        current
          ? {
              ...current,
              status: 'uploading',
              errorMessage: undefined,
            }
          : current
      );

      const packageId = draft.packageId.trim();
      const uploadResult = await createBackstageReleaseUploadUrl({ packageId });
      const resolvedDisplayName = draft.displayName.trim() || selectedLane?.title || packageId;
      const upload = await uploadBackstageReleaseFile({
        uploadUrl: uploadResult.uploadUrl,
        file: selectedUpload.file,
        packageId,
        version: draft.version.trim(),
        displayName: resolvedDisplayName,
        description: draft.description.trim() || undefined,
        unityVersion: draft.unityVersion.trim() || undefined,
      });

      const productLanes = buildProductLanes(productsQuery.data?.products ?? []);
      const selectedLane = productLanes.find((lane) => lane.laneKey === draft.laneKey);
      const linkedPackage = selectedLane?.primaryPackage ?? null;

      const result = await publishBackstageRelease({
        packageId,
        body: {
          catalogProductId: draft.catalogProductIds[0] ?? '',
          catalogProductIds: draft.catalogProductIds,
          storageId: upload.storageId,
          version: draft.version.trim(),
          zipSha256: upload.zipSha256,
          channel: draft.channel.trim() || 'stable',
          packageName: packageId,
          displayName: resolvedDisplayName,
          description: draft.description.trim() || undefined,
          repositoryVisibility: draft.repositoryVisibility,
          defaultChannel: draft.channel.trim() || linkedPackage?.defaultChannel || 'stable',
          unityVersion: draft.unityVersion.trim() || undefined,
          contentType: upload.contentType,
          deliveryName: upload.deliveryName,
        },
      });

      return {
        packageId,
        result,
      };
    },
    onSuccess: async ({ packageId, result }) => {
      setSelectedUpload((current) =>
        current
          ? {
              ...current,
              status: 'complete',
              errorMessage: undefined,
            }
          : current
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: creatorPackagesQueryKey }),
        queryClient.invalidateQueries({ queryKey: creatorBackstageProductsQueryKey }),
      ]);
      toast.success('Backstage release published', {
        description: `${packageId}@${result.version} is now on ${result.channel}.`,
      });
      setIsPublishOpen(false);
      setIsAdvancedPublishOptionsOpen(false);
      setPublishDraft(buildDraftFromLane(null));
      setSelectedUpload(null);
    },
    onError: (error) => {
      const message =
        error instanceof Error ? error.message : 'This release could not be published.';
      setSelectedUpload((current) =>
        current
          ? {
              ...current,
              status: 'failed',
              errorMessage: message,
            }
          : current
      );
      if (isDashboardAuthError(error)) {
        markSessionExpired();
        return;
      }
      toast.error('Could not publish Backstage release', { description: message });
    },
  });

  const packages = useMemo(
    () =>
      [...(packagesQuery.data?.packages ?? [])].sort((a, b) =>
        (a.packageName ?? a.packageId).localeCompare(b.packageName ?? b.packageId)
      ),
    [packagesQuery.data?.packages]
  );
  const products = useMemo(
    () =>
      [...(productsQuery.data?.products ?? [])].sort((a, b) =>
        (a.displayName ?? a.productId).localeCompare(b.displayName ?? b.productId)
      ),
    [productsQuery.data?.products]
  );
  const productLanes = useMemo(() => buildProductLanes(products), [products]);
  const activePackages = packages.filter((pkg) => pkg.status === 'active');
  const archivedPackages = packages.filter((pkg) => pkg.status === 'archived');
  const linkedLanes = productLanes.filter((lane) => lane.packageLinks.length > 0);
  const listedLanes = linkedLanes.filter(
    (lane) => lane.primaryPackage?.latestRelease?.releaseStatus === 'published'
  );
  const selectedLane = productLanes.find((lane) => lane.laneKey === publishDraft.laneKey);
  const hasBlockingError =
    (packagesQuery.isError && !isDashboardAuthError(packagesQuery.error)) ||
    (productsQuery.isError && !isDashboardAuthError(productsQuery.error)) ||
    (repoAccessQuery.isError && !isDashboardAuthError(repoAccessQuery.error));
  const isWorkspaceLoading =
    ((packagesQuery.isLoading && !packagesQuery.data) ||
      (productsQuery.isLoading && !productsQuery.data) ||
      (repoAccessQuery.isLoading && !repoAccessQuery.data)) &&
    !hasBlockingError;

  function handleCopyId(packageId: string) {
    copyToClipboard(packageId).then((ok) => {
      if (ok) toast.success('Package ID copied');
      else toast.error('Could not copy to clipboard');
    });
  }

  function handleCopyValue(value: string, successLabel: string) {
    copyToClipboard(value).then((ok) => {
      if (ok) {
        toast.success(successLabel);
        return;
      }
      toast.error('Could not copy to clipboard');
    });
  }

  function openPublishSheet(lane?: ProductLane | null) {
    setPublishDraft(buildDraftFromLane(lane));
    setIsAdvancedPublishOptionsOpen(false);
    setSelectedUpload(null);
    setIsPublishOpen(true);
  }

  function handleLaneSelection(key: Key | null) {
    const laneKey = key ? String(key) : '';
    const lane = productLanes.find((candidate) => candidate.laneKey === laneKey) ?? null;
    setPublishDraft((current) => {
      const baseDraft = buildDraftFromLane(lane);
      return {
        ...baseDraft,
        description: current.description,
        laneKey,
        packageId: baseDraft.packageId || current.packageId,
        version: current.version,
      };
    });
  }

  function handleUploadSelection(file: File | null) {
    if (!file) {
      setSelectedUpload(null);
      return;
    }
    const artifactKind = getBackstageArtifactKind(file.name);
    if (!artifactKind) {
      toast.error('Choose a supported package file', {
        description: 'Backstage accepts .unitypackage files and legacy .zip bundles.',
      });
      return;
    }
    setSelectedUpload({
      artifactKind,
      contentType: getBackstageArtifactContentType(file, artifactKind),
      file,
      status: 'ready',
    });
  }

  async function handleDrop(event: {
    items: Array<{ kind: string; getFile?: () => Promise<File> }>;
  }) {
    for (const item of event.items) {
      if (item.kind === 'file' && item.getFile) {
        handleUploadSelection(await item.getFile());
        return;
      }
    }
  }

  return (
    <section className={className}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <div className="bg-surface-secondary flex size-11 items-center justify-center rounded-2xl border border-border/70">
            <img
              src="/Icons/Library.png"
              alt=""
              aria-hidden="true"
              className="size-6 object-contain"
            />
          </div>
          <p className="text-muted text-sm">Creator package distribution workspace</p>
        </div>

        {hasBlockingError ? (
          <AccountInlineError message="Failed to load your Backstage workspace. Refresh and try again." />
        ) : null}

        {isWorkspaceLoading ? (
          <Card className="rounded-[30px] border border-border/70 bg-surface/95 shadow-none">
            <Card.Content className="flex flex-col gap-5 p-6 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 gap-4">
                <div className="bg-surface-secondary text-accent flex size-16 shrink-0 items-center justify-center rounded-[22px] border border-border/60">
                  <StreamlineUploadBoxIcon className="size-10" />
                </div>
                <div className="min-w-0 space-y-3">
                  <Chip color="accent" size="sm" variant="soft">
                    Backstage Repos
                  </Chip>
                  <div className="space-y-2">
                    <h2 className="text-foreground text-2xl font-semibold leading-tight">
                      Loading package workspace
                    </h2>
                    <p className="text-muted max-w-[68ch] text-sm leading-6">
                      Pulling your creator repo link, merged release lanes, and reusable package
                      IDs.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-surface-secondary text-foreground inline-flex items-center gap-3 self-start rounded-full border border-border/60 px-4 py-2 text-sm">
                <span className="btn-loading-spinner" aria-hidden="true" />
                <span>Syncing your Backstage workspace...</span>
              </div>
            </Card.Content>
          </Card>
        ) : (
          <>
            <Card className="overflow-hidden rounded-[30px] border border-border/70 bg-surface/95 shadow-none">
              <Card.Content className="grid gap-6 p-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                <div className="min-w-0 space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="bg-surface-secondary flex size-16 shrink-0 items-center justify-center rounded-[22px] border border-border/60">
                      <StreamlineUploadBoxIcon className="size-10" />
                    </div>
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Chip color="accent" size="sm" variant="soft">
                          Backstage Repos
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {productLanes.length} release lanes
                        </Chip>
                        <Chip size="sm" variant="soft">
                          {products.length} storefront records
                        </Chip>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-foreground text-2xl font-semibold leading-tight">
                          {title}
                        </h2>
                        <p className="text-muted max-w-[72ch] text-sm leading-6">{description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <YucpButton yucp="secondary" pill onPress={() => openPublishSheet(null)}>
                      <ArrowUpFromLine className="size-4" />
                      Publish release
                    </YucpButton>
                    {repoAccessQuery.data?.addRepoUrl ? (
                      <YucpButton
                        yucp="ghost"
                        pill
                        onPress={() => {
                          window.location.href = repoAccessQuery.data?.addRepoUrl ?? '';
                        }}
                      >
                        <ExternalLink className="size-4" />
                        Open in VCC
                      </YucpButton>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Chip size="sm" variant="soft">
                      {activePackages.length} active IDs
                    </Chip>
                    <Chip size="sm" variant="soft">
                      {listedLanes.length} published lanes
                    </Chip>
                    <Chip size="sm" variant="soft">
                      {archivedPackages.length} archived IDs
                    </Chip>
                  </div>
                </div>

                <Card className="rounded-[24px] border border-border/60 bg-surface-secondary/70 shadow-none">
                  <Card.Content className="space-y-4 p-5">
                    <div className="flex items-start gap-3">
                      <div className="bg-surface flex size-12 shrink-0 items-center justify-center rounded-2xl border border-border/60">
                        <StreamlineLinkChainIcon className="size-8" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-foreground text-sm font-semibold">Creator repo URL</p>
                        <p className="text-muted text-sm leading-6">
                          This creator-specific repo path stays stable across mirrored storefronts.
                          Buyer tokens still decide who can actually resolve packages from it.
                        </p>
                      </div>
                    </div>
                    {repoAccessQuery.data?.creatorRepoRef ? (
                      <div className="flex flex-wrap gap-2">
                        <Chip size="sm" variant="soft">
                          {repoAccessQuery.data.creatorName ?? 'Creator'}
                        </Chip>
                        <Chip className="font-mono text-[11px]" size="sm" variant="soft">
                          {repoAccessQuery.data.creatorRepoRef}
                        </Chip>
                      </div>
                    ) : null}
                    {repoAccessQuery.data?.expiresAt ? (
                      <p className="text-muted text-xs leading-5">
                        Token window refreshes automatically. Current dev link expires{' '}
                        {formatRelativeTime(repoAccessQuery.data.expiresAt)}.
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onPress={() =>
                          repoAccessQuery.data?.addRepoUrl
                            ? handleCopyValue(
                                repoAccessQuery.data.addRepoUrl,
                                'Add-repo link copied'
                              )
                            : Promise.resolve(false)
                        }
                      >
                        <Copy className="size-4" />
                        Copy add-repo link
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onPress={() =>
                          repoAccessQuery.data?.repositoryUrl
                            ? handleCopyValue(repoAccessQuery.data.repositoryUrl, 'Repo URL copied')
                            : Promise.resolve(false)
                        }
                      >
                        <Copy className="size-4" />
                        Copy repo URL
                      </Button>
                    </div>
                  </Card.Content>
                </Card>
              </Card.Content>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <StatCard
                icon={<StreamlineShippingBoxIcon className="size-7" />}
                label="Active package IDs"
                value={activePackages.length}
                detail="Reusable identities for exporter and release publishing."
              />
              <StatCard
                icon={<Store className="size-5" />}
                label="Linked lanes"
                value={linkedLanes.length}
                detail="Merged release lanes already pointing at a Backstage package."
              />
              <StatCard
                icon={<StreamlineLinkChainIcon className="size-7" />}
                label="Published lanes"
                value={listedLanes.length}
                detail="Release lanes currently exposing a published repo version."
              />
              <StatCard
                icon={<StreamlineArchiveBoxIcon className="size-7" />}
                label="Archived IDs"
                value={archivedPackages.length}
                detail="Dormant package IDs kept for audit and future restores."
              />
            </div>

            <div className="grid gap-5 xl:grid-cols-[1.25fr_0.95fr]">
              <Card className="rounded-[28px] border border-border/70 bg-surface/95 shadow-none">
                <Card.Header className="flex flex-col gap-4 p-6 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <StreamlineLinkChainIcon className="size-6" />
                        <p className="text-foreground text-lg font-semibold">Release lanes</p>
                      </div>
                      <p className="text-muted max-w-[62ch] text-sm">
                        Storefront entries with the same creator product now merge into one lane, so
                        one publish can relink every matching store record together.
                      </p>
                    </div>
                    <Chip size="sm" variant="soft">
                      {productLanes.length} lanes
                    </Chip>
                  </div>
                </Card.Header>
                <Card.Content className="p-6 pt-0">
                  {productLanes.length === 0 ? (
                    <EmptyState className="rounded-2xl border border-dashed border-border/70 bg-surface-secondary/50">
                      <EmptyState.Header>
                        <EmptyState.Media variant="icon">
                          <Store />
                        </EmptyState.Media>
                        <EmptyState.Title>No catalog products yet</EmptyState.Title>
                        <EmptyState.Description>
                          Sync or create creator products first. Once a product exists, you can
                          attach a Backstage package release to it from this workspace.
                        </EmptyState.Description>
                      </EmptyState.Header>
                    </EmptyState>
                  ) : (
                    <ScrollShadow className="max-h-[720px] overflow-y-auto pr-1">
                      <div className="space-y-3">
                        {productLanes.map((lane) => (
                          <ProductLaneCard
                            key={lane.laneKey}
                            lane={lane}
                            onPublish={openPublishSheet}
                          />
                        ))}
                      </div>
                    </ScrollShadow>
                  )}
                </Card.Content>
              </Card>

              <Card className="rounded-[28px] border border-border/70 bg-surface/95 shadow-none">
                <Card.Header className="flex flex-col gap-3 p-6 pb-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <StreamlineShippingBoxIcon className="size-6" />
                        <p className="text-foreground text-lg font-semibold">Package identities</p>
                      </div>
                      <p className="text-muted text-sm">
                        Keep IDs stable for Unity exports and reuse them across release updates when
                        product content changes.
                      </p>
                    </div>
                    <Chip size="sm" variant="soft">
                      {activePackages.length} active
                    </Chip>
                  </div>
                </Card.Header>
                <Card.Content className="space-y-4 p-6 pt-0">
                  {packages.length === 0 ? (
                    <EmptyState className="rounded-2xl border border-dashed border-border/70 bg-surface-secondary/50">
                      <EmptyState.Header>
                        <EmptyState.Media variant="icon">
                          <FolderUp />
                        </EmptyState.Media>
                        <EmptyState.Title>No package IDs registered yet</EmptyState.Title>
                        <EmptyState.Description>
                          Publish a Backstage release with a new package ID, or keep using the Unity
                          exporter to seed identities here first.
                        </EmptyState.Description>
                      </EmptyState.Header>
                      <EmptyState.Content>
                        <Button size="sm" variant="outline" onPress={() => openPublishSheet(null)}>
                          Publish first release
                        </Button>
                      </EmptyState.Content>
                    </EmptyState>
                  ) : (
                    <>
                      <ScrollShadow className="max-h-[520px] overflow-y-auto pr-1">
                        <div className="space-y-3">
                          {activePackages.map((pkg) => (
                            <PackageRegistryItem
                              key={pkg.packageId}
                              pkg={pkg}
                              isEditing={editingId === pkg.packageId}
                              editName={
                                editingId === pkg.packageId ? editingName : (pkg.packageName ?? '')
                              }
                              isSaving={pendingSaveId === pkg.packageId && renameMutation.isPending}
                              isDeleting={
                                pendingDeleteId === pkg.packageId && deleteMutation.isPending
                              }
                              isArchiving={
                                pendingArchiveId === pkg.packageId && archiveMutation.isPending
                              }
                              isRestoring={false}
                              onEditStart={() => {
                                setEditingId(pkg.packageId);
                                setEditingName(pkg.packageName ?? '');
                              }}
                              onEditCancel={() => setEditingId(null)}
                              onEditChange={setEditingName}
                              onSave={() =>
                                renameMutation.mutate({
                                  packageId: pkg.packageId,
                                  packageName: editingName.trim(),
                                })
                              }
                              onArchive={() => archiveMutation.mutate({ packageId: pkg.packageId })}
                              onRestore={() => {}}
                              onDelete={() => deleteMutation.mutate({ packageId: pkg.packageId })}
                              onCopyId={() => handleCopyId(pkg.packageId)}
                            />
                          ))}
                        </div>
                      </ScrollShadow>

                      {archivedPackages.length > 0 ? (
                        <>
                          <Separator />
                          <div className="space-y-3">
                            <Button
                              aria-expanded={isArchivedExpanded}
                              className="justify-between"
                              size="sm"
                              variant="ghost"
                              onPress={() => setIsArchivedExpanded((value) => !value)}
                            >
                              <span className="flex items-center gap-2">
                                <Archive className="size-4" />
                                Archived package IDs
                              </span>
                              <Chip size="sm" variant="soft">
                                {archivedPackages.length}
                              </Chip>
                            </Button>
                            {isArchivedExpanded ? (
                              <div className="space-y-3">
                                {archivedPackages.map((pkg) => (
                                  <PackageRegistryItem
                                    key={pkg.packageId}
                                    pkg={pkg}
                                    isEditing={false}
                                    editName={pkg.packageName ?? ''}
                                    isSaving={false}
                                    isDeleting={
                                      pendingDeleteId === pkg.packageId && deleteMutation.isPending
                                    }
                                    isArchiving={false}
                                    isRestoring={
                                      pendingRestoreId === pkg.packageId &&
                                      restoreMutation.isPending
                                    }
                                    onEditStart={() => {}}
                                    onEditCancel={() => {}}
                                    onEditChange={() => {}}
                                    onSave={() => {}}
                                    onArchive={() => {}}
                                    onRestore={() =>
                                      restoreMutation.mutate({ packageId: pkg.packageId })
                                    }
                                    onDelete={() =>
                                      deleteMutation.mutate({ packageId: pkg.packageId })
                                    }
                                    onCopyId={() => handleCopyId(pkg.packageId)}
                                  />
                                ))}
                              </div>
                            ) : null}
                          </div>
                        </>
                      ) : null}
                    </>
                  )}
                </Card.Content>
              </Card>
            </div>
          </>
        )}
      </div>

      <Sheet isOpen={isPublishOpen} onOpenChange={setIsPublishOpen}>
        <Sheet.Backdrop variant="blur">
          <Sheet.Content className="mx-auto max-h-[94vh] max-w-[760px]">
            <Sheet.Dialog>
              <Sheet.Handle />
              <Sheet.CloseTrigger />
              <Sheet.Header>
                <Sheet.Heading>Publish a Backstage release</Sheet.Heading>
              </Sheet.Header>
              <Sheet.Body className="space-y-6">
                <Card className="rounded-[24px] border border-border/60 bg-surface-secondary/70 shadow-none">
                  <Card.Content className="grid gap-4 p-5 lg:grid-cols-[auto,minmax(0,1fr)]">
                    <div className="bg-surface flex size-14 items-center justify-center rounded-2xl border border-border/60">
                      <StreamlineUploadBoxIcon className="size-8" />
                    </div>
                    <div className="space-y-2">
                      <p className="text-foreground text-sm font-semibold">Release target</p>
                      <p className="text-muted text-sm leading-6">
                        Pick the release lane once, then upload the same Unity package export you
                        already hand to buyers so every matching storefront stays aligned to one
                        release lane.
                      </p>
                      <p className="text-muted text-xs leading-5">
                        Use a .unitypackage for the default creator flow. Legacy .zip bundles still
                        upload if you are migrating an older VPM export.
                      </p>
                    </div>
                  </Card.Content>
                </Card>

                <Select
                  aria-label="Release lane"
                  className="w-full"
                  placeholder="Choose a release lane"
                  selectedKey={publishDraft.laneKey || null}
                  onSelectionChange={handleLaneSelection}
                >
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {productLanes.map((lane) => (
                        <ListBox.Item key={lane.laneKey} id={lane.laneKey} textValue={lane.title}>
                          <div className="flex flex-col">
                            <span>{lane.title}</span>
                            <span className="text-muted text-xs">
                              {lane.products.length} storefront
                              {lane.products.length === 1 ? '' : 's'} ·{' '}
                              {lane.providerLabels.join(', ')}
                            </span>
                          </div>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                {selectedLane ? (
                  <Card className="rounded-2xl border border-border/60 bg-surface-secondary/70 shadow-none">
                    <Card.Content className="space-y-3 p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-foreground text-sm font-medium">
                            {selectedLane.title}
                          </p>
                          <p className="text-muted text-sm">
                            {selectedLane.products.length} storefront
                            {selectedLane.products.length === 1 ? '' : 's'} ·{' '}
                            {selectedLane.providerLabels.join(', ')}
                          </p>
                        </div>
                        {selectedLane.packageLinks.length > 1 ? (
                          <Chip color="warning" size="sm" variant="soft">
                            Multiple package IDs linked
                          </Chip>
                        ) : selectedLane.primaryPackage ? (
                          <Chip size="sm" variant="soft">
                            Current package {selectedLane.primaryPackage.packageId}
                          </Chip>
                        ) : (
                          <Chip size="sm" variant="soft">
                            First package link for this lane
                          </Chip>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {selectedLane.providerRefs.map((providerRef) => (
                          <Chip key={providerRef} size="sm" variant="soft">
                            {providerRef}
                          </Chip>
                        ))}
                      </div>
                    </Card.Content>
                  </Card>
                ) : null}

                <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
                  {selectedLane?.primaryPackage && selectedLane.packageLinks.length === 1 ? (
                    <Card className="rounded-2xl border border-border/60 bg-surface-secondary/70 shadow-none">
                      <Card.Content className="space-y-2 p-4">
                        <p className="text-muted text-xs font-medium tracking-[0.12em] uppercase">
                          Package ID
                        </p>
                        <p className="text-foreground break-all font-mono text-sm">
                          {selectedLane.primaryPackage.packageId}
                        </p>
                        <p className="text-muted text-xs leading-5">
                          This lane already has a stable package identity, so this publish reuses
                          it.
                        </p>
                      </Card.Content>
                    </Card>
                  ) : (
                    <YucpInput
                      aria-label="Package ID"
                      placeholder="com.yucp.package.name"
                      value={publishDraft.packageId}
                      onValueChange={(value) =>
                        setPublishDraft((current) => ({
                          ...current,
                          packageId: value,
                        }))
                      }
                    />
                  )}

                  <Select
                    aria-label="Repository visibility"
                    className="w-full"
                    selectedKey={publishDraft.repositoryVisibility}
                    onSelectionChange={(key) =>
                      setPublishDraft((current) => ({
                        ...current,
                        repositoryVisibility: String(key ?? 'listed') as 'hidden' | 'listed',
                      }))
                    }
                  >
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="listed" textValue="Listed">
                          Listed in repo
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="hidden" textValue="Hidden">
                          Hidden until you are ready
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                {!selectedLane?.primaryPackage && activePackages.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-muted text-xs font-medium tracking-[0.12em] uppercase">
                      Quick fill from registered IDs
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {activePackages.slice(0, 6).map((pkg) => (
                        <Button
                          key={pkg.packageId}
                          size="sm"
                          variant="ghost"
                          onPress={() =>
                            setPublishDraft((current) => ({
                              ...current,
                              packageId: pkg.packageId,
                              displayName:
                                current.displayName || pkg.packageName || current.displayName,
                            }))
                          }
                        >
                          <Package2 className="size-4" />
                          {pkg.packageName ?? pkg.packageId}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="grid gap-4 md:grid-cols-2">
                  <YucpInput
                    aria-label="Version"
                    placeholder="1.0.0"
                    value={publishDraft.version}
                    onValueChange={(value) =>
                      setPublishDraft((current) => ({
                        ...current,
                        version: value,
                      }))
                    }
                  />
                  <YucpInput
                    aria-label="Unity version"
                    placeholder="Unity version (optional)"
                    value={publishDraft.unityVersion}
                    onValueChange={(value) =>
                      setPublishDraft((current) => ({
                        ...current,
                        unityVersion: value,
                      }))
                    }
                  />
                </div>

                <details
                  className="rounded-2xl border border-border/60 bg-surface-secondary/50 p-4"
                  open={isAdvancedPublishOptionsOpen}
                  onToggle={(event) =>
                    setIsAdvancedPublishOptionsOpen(
                      (event.currentTarget as HTMLDetailsElement).open
                    )
                  }
                >
                  <summary className="text-foreground cursor-pointer list-none text-sm font-medium">
                    Advanced repo details
                  </summary>
                  <div className="mt-4 space-y-4">
                    <div className="grid gap-4 md:grid-cols-2">
                      <YucpInput
                        aria-label="Display name"
                        placeholder="Subscriber-facing package name"
                        value={publishDraft.displayName}
                        onValueChange={(value) =>
                          setPublishDraft((current) => ({
                            ...current,
                            displayName: value,
                          }))
                        }
                      />
                      <YucpInput
                        aria-label="Channel"
                        placeholder="stable"
                        value={publishDraft.channel}
                        onValueChange={(value) =>
                          setPublishDraft((current) => ({
                            ...current,
                            channel: value,
                          }))
                        }
                      />
                    </div>
                    <TextArea
                      aria-label="Release description"
                      placeholder="What changed in this package release?"
                      variant="secondary"
                      value={publishDraft.description}
                      onChange={(event) =>
                        setPublishDraft((current) => ({
                          ...current,
                          description: event.target.value,
                        }))
                      }
                    />
                  </div>
                </details>

                <DropZone className="w-full">
                  <DropZone.Area onDrop={handleDrop as never}>
                    <DropZone.Icon>
                      <StreamlineShippingBoxIcon className="size-8" />
                    </DropZone.Icon>
                    <DropZone.Label>Drop a Unity package here</DropZone.Label>
                    <DropZone.Description>
                      Upload the .unitypackage you already export today. Older .zip bundles still
                      work for migrations.
                    </DropZone.Description>
                    <DropZone.Trigger isDisabled={publishMutation.isPending}>
                      Choose package file
                    </DropZone.Trigger>
                  </DropZone.Area>
                  <DropZone.Input
                    accept={UNITYPACKAGE_ACCEPT_VALUE}
                    onSelect={(fileList) => handleUploadSelection(fileList.item(0))}
                  />

                  {selectedUpload ? (
                    <DropZone.FileList>
                      <DropZone.FileItem status={mapUploadStatus(selectedUpload.status)}>
                        <DropZone.FileFormatIcon
                          color={selectedUpload.artifactKind === 'unitypackage' ? 'blue' : 'orange'}
                          format={selectedUpload.artifactKind === 'unitypackage' ? 'UNITY' : 'ZIP'}
                        />
                        <DropZone.FileInfo>
                          <DropZone.FileName>{selectedUpload.file.name}</DropZone.FileName>
                          <DropZone.FileMeta>
                            {formatFileSize(selectedUpload.file.size)}
                            {' | '}
                            {selectedUpload.artifactKind === 'unitypackage'
                              ? 'Unity package'
                              : 'Legacy ZIP'}
                            {selectedUpload.status === 'ready' ? ' | Ready to publish' : null}
                            {selectedUpload.status === 'uploading' ? ' | Uploading…' : null}
                            {selectedUpload.status === 'complete' ? ' | Uploaded' : null}
                            {selectedUpload.status === 'failed' ? ' | Upload failed' : null}
                          </DropZone.FileMeta>
                          {selectedUpload.status === 'uploading' ? (
                            <DropZone.FileProgress value={66}>
                              <DropZone.FileProgressTrack>
                                <DropZone.FileProgressFill />
                              </DropZone.FileProgressTrack>
                            </DropZone.FileProgress>
                          ) : null}
                          {selectedUpload.errorMessage ? (
                            <DropZone.FileMeta>{selectedUpload.errorMessage}</DropZone.FileMeta>
                          ) : null}
                        </DropZone.FileInfo>
                        <DropZone.FileRemoveTrigger
                          aria-label={`Remove ${selectedUpload.file.name}`}
                          onPress={() => setSelectedUpload(null)}
                        />
                      </DropZone.FileItem>
                    </DropZone.FileList>
                  ) : null}
                </DropZone>
              </Sheet.Body>
              <Sheet.Footer>
                <Sheet.Close>
                  <Button variant="secondary">Cancel</Button>
                </Sheet.Close>
                <YucpButton
                  isLoading={publishMutation.isPending}
                  isDisabled={
                    publishMutation.isPending ||
                    publishDraft.catalogProductIds.length === 0 ||
                    !publishDraft.packageId.trim() ||
                    !publishDraft.version.trim() ||
                    !selectedUpload?.file
                  }
                  onPress={() => publishMutation.mutate(publishDraft)}
                >
                  <ArrowUpFromLine className="size-4" />
                  Publish release
                </YucpButton>
              </Sheet.Footer>
            </Sheet.Dialog>
          </Sheet.Content>
        </Sheet.Backdrop>
      </Sheet>
    </section>
  );
}
