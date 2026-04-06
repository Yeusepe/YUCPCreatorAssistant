import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/setup/itchio')({
  head: () => ({
    meta: [{ title: 'Connect itch.io | Creator Assistant' }],
  }),
});
