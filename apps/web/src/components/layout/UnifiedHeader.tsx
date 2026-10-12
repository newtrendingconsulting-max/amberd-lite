'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { UserProfileMenu } from '@/components/public/UserProfileMenu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { authStorage, AUTH_CHANGE_EVENT } from '@/lib/auth-storage';
import {
  Header,
  HeaderBrand,
  HeaderActions,
  HeaderMobileMenuTrigger,
} from '@/components/ui/navigation';
import { Sheet, SheetTrigger, SheetContent } from '@/components/ui/Sheet';
import { LOGO_PATH } from '@/lib/brand';
import { Menu } from 'lucide-react';
import { NAV_SECTIONS } from '@/components/amberd/AmberdSidebar';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

import { useAuth } from '@/hooks/use-auth';

import { getManagementUrl } from '@/lib/url-generator';

export function UnifiedHeader({
  customLogoUrl,
  logoHeight,
}: {
  customLogoUrl?: string | null;
  logoHeight?: number | null;
}) {
  const pathname = usePathname();
  const { isAuthenticated, isLoaded } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Before mount or during initial load, show unauthenticated UI to avoid flashing
  const showAuthenticatedUI = isLoaded && isAuthenticated;

  return (
    <Header
      fixed={false}
      className="sticky top-0 z-50 w-full h-16 border-border bg-card/80 backdrop-blur-md px-0"
    >
      <div className="flex items-center justify-between h-full w-full">
        <div className="flex items-center gap-6 min-w-0">
          <HeaderBrand
            as={Link}
            href="/"
            logoSrc={customLogoUrl || LOGO_PATH}
            logoAlt="Amberd Lite"
            brandName={customLogoUrl ? '' : 'Amberd Lite'}
            logoHeight={logoHeight}
            isCustomLogo={!!customLogoUrl}
            className={customLogoUrl && !logoHeight ? 'max-h-10 w-auto' : ''}
          />
          {!customLogoUrl && (
            <span className="hidden rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-600/20 sm:inline-flex">
              Hackathon Demo
            </span>
          )}
        </div>

        <HeaderActions className="gap-3">
          {showAuthenticatedUI ? (
            <>
              <NotificationCenter />
              <ThemeToggle />
              <UserProfileMenu />
            </>
          ) : isLoaded ? (
            <>
              <Link href={getManagementUrl('/get-started')} className="hidden md:inline-flex">
                <Button>Get Started</Button>
              </Link>
              <Link href={getManagementUrl('/login')} className="hidden md:inline-flex">
                <Button variant="outline">Login</Button>
              </Link>
            </>
          ) : null}

          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <HeaderMobileMenuTrigger aria-label="Open navigation menu">
                <Menu className="h-5 w-5" />
              </HeaderMobileMenuTrigger>
            </SheetTrigger>
            <SheetContent side="right">
              <div className="flex flex-col gap-3">
                {showAuthenticatedUI ? (
                  <nav className="flex flex-col gap-4" aria-label="Main navigation">
                    {NAV_SECTIONS.map((section) => (
                      <div key={section.title}>
                        <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {section.title}
                        </p>
                        {section.items.map((item) => (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          >
                            <item.icon className="h-4 w-4 flex-shrink-0" />
                            <span>{item.label}</span>
                          </Link>
                        ))}
                      </div>
                    ))}
                  </nav>
                ) : (
                  <>
                    <Link
                      href={getManagementUrl('/get-started')}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center px-4 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 transition-opacity"
                    >
                      Get Started
                    </Link>
                    <Link
                      href={getManagementUrl('/login')}
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center px-4 py-2.5 rounded-xl border border-input bg-background font-medium hover:bg-muted transition-colors"
                    >
                      Login
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </HeaderActions>
      </div>
    </Header>
  );
}
