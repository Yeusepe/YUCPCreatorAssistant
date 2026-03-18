import { useCallback } from 'react';
import { authClient } from '@/lib/auth-client';

export function useAuth() {
  const session = authClient.useSession();

  const signIn = useCallback(async (redirectTo?: string) => {
    await authClient.signIn.social({
      provider: 'discord',
      callbackURL: redirectTo ?? '/dashboard',
    });
  }, []);

  const signOut = useCallback(async () => {
    await authClient.signOut({
      fetchOptions: {
        onSuccess: () => {
          // Required when using ConvexQueryClient with expectAuth: true.
          // Without reload, authenticated queries fire before auth is ready on re-login.
          location.reload();
        },
      },
    });
  }, []);

  return {
    session: session.data,
    isPending: session.isPending,
    isAuthenticated: !!session.data?.user,
    signIn,
    signOut,
  };
}
