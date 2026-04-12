import { Chip } from '@heroui/react';
import type { CSSProperties } from 'react';

interface ProviderChipProps {
  name: string;
  className?: string;
  style?: CSSProperties;
}

export function ProviderChip({ name, className, style }: ProviderChipProps) {
  return (
    <Chip
      variant="soft"
      color="default"
      size="sm"
      className={`max-w-full rounded-full ${className ?? ''}`}
      style={style}
    >
      <span className="block max-w-full break-all text-left whitespace-normal">{name}</span>
    </Chip>
  );
}
