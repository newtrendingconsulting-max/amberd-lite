'use client';

import { ReactNode, useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import { AmberdSidebar } from './AmberdSidebar';

/**
 * Readable "signed in" hint for the server render. The API sets an httpOnly
 * access-token cookie with the same name the layout used to check, which
 * expires after 15 minutes and cannot be refreshed from the browser, so full
 * page loads briefly rendered without the sidebar. This hint carries no
 * credential; every API call is still authenticated by its token.
 */
export const SIGNED_IN_HINT_COOKIE = 'amberd_signed_in';

/**
 * Decides whether the Amberd Lite sidebar is shown.
 *
 * The server's cookie check gives the first render (no flash on a full page
 * load), but signing in happens on the client after the root layout has
 * already rendered, so the browser's auth state takes over once it is known.
 * Without that hand-off the sidebar stayed hidden after login until a hard
 * refresh.
 */
export const AppShell = ({
  initialSignedIn,
  isPublicSurface,
  children,
}: {
  initialSignedIn: boolean;
  isPublicSurface: boolean;
  children: ReactNode;
}) => {
  const { isAuthenticated, isLoaded } = useAuth();

  useEffect(() => {
    if (!isLoaded) return;
    document.cookie = isAuthenticated
      ? `${SIGNED_IN_HINT_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
      : `${SIGNED_IN_HINT_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }, [isAuthenticated, isLoaded]);
  const isSignedIn = isLoaded ? isAuthenticated : initialSignedIn;
  const showSidebar = !isPublicSurface && isSignedIn;

  return (
    <div className="flex flex-1 min-w-0">
      {showSidebar && <AmberdSidebar />}
      <main className={cn('flex-1 min-w-0', showSidebar && 'md:ml-60')}>{children}</main>
    </div>
  );
};
