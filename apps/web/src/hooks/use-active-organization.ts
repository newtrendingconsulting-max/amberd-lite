'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { organizationsApi } from '@/lib/organizations-api';

const STORAGE_KEY = 'amberd.activeOrganizationId';
const CHANGE_EVENT = 'amberd:active-organization';

const readStored = (): string | null => {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
};

/**
 * The organization Amberd Lite pages operate on. Remembered per browser; falls back
 * to the caller's first organization. The API still enforces membership on
 * every request, so this is only a UI preference.
 */
export const useActiveOrganization = () => {
  const [storedId, setStoredId] = useState<string | null>(null);
  // Cached query data exists on the client but not on the server; wait for
  // mount so the first client render matches the server HTML.
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
    setStoredId(readStored());
    const handleChange = () => setStoredId(readStored());
    window.addEventListener(CHANGE_EVENT, handleChange);
    return () => window.removeEventListener(CHANGE_EVENT, handleChange);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ['user-organizations'],
    queryFn: () => organizationsApi.getUserOrganizations(),
    staleTime: 60_000,
  });

  const organizations = isMounted ? (data?.organizations ?? []) : [];
  const active = organizations.find((org) => org.id === storedId) ?? organizations[0] ?? null;

  const setActiveOrganization = useCallback((organizationId: string) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, organizationId);
    } catch {
      // Storage unavailable: the choice lasts for this page view only.
    }
    setStoredId(organizationId);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return {
    organizationId: active?.id ?? null,
    organization: active,
    organizations,
    isLoading: !isMounted || isLoading,
    setActiveOrganization,
  };
};
