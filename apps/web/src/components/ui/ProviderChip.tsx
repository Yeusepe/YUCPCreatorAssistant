import { Chip } from '@heroui/react';

interface ProviderChipProps {
  name: string;
  className?: string;
}

export function ProviderChip({ name, className }: ProviderChipProps) {
  return (
    <Chip
      variant="soft"
      color="default"
      size="sm"
      className={`max-w-full rounded-full ${className ?? ''}`}
    >
      <span className="block max-w-full break-all text-left whitespace-normal">{name}</span>
    </Chip>
  );
}
