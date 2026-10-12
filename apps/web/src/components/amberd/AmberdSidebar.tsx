'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  Bell,
  Bot,
  CalendarClock,
  Cpu,
  Database,
  DollarSign,
  LayoutDashboard,
  LayoutTemplate,
  ScrollText,
  Settings,
  ShieldCheck,
  Sparkles,
  Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveOrganization } from '@/hooks/use-active-organization';

export const NAV_SECTIONS = [
  { title: 'Overview', items: [{ href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard }] },
  {
    title: 'Operations',
    items: [
      { href: '/agents', label: 'Agents', icon: Bot },
      { href: '/runs', label: 'Runs', icon: Activity },
      { href: '/templates', label: 'Templates', icon: LayoutTemplate },
      { href: '/scheduling', label: 'Scheduling', icon: CalendarClock },
    ],
  },
  {
    title: 'Infrastructure',
    items: [
      { href: '/connections', label: 'Data Connections', icon: Database },
      { href: '/models', label: 'LLM Models', icon: Sparkles },
      { href: '/gpu', label: 'GPU & Resources', icon: Cpu },
    ],
  },
  {
    title: 'Governance',
    items: [
      { href: '/policies', label: 'Resource Policies', icon: ShieldCheck },
      { href: '/costs', label: 'Costs', icon: DollarSign },
      { href: '/alerts', label: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'Admin',
    items: [
      { href: '/members', label: 'Users', icon: Users },
      { href: '/logs', label: 'Logs', icon: ScrollText },
      { href: '/platform-settings', label: 'Settings', icon: Settings },
    ],
  },
] as const;

export const isNavActive = (pathname: string, href: string): boolean =>
  pathname === href || pathname.startsWith(`${href}/`);

/** Primary Amberd Lite navigation: dark navy rail with grouped sections. */
export const AmberdSidebar = () => {
  const pathname = usePathname() ?? '';
  const { organizations, organizationId, setActiveOrganization } = useActiveOrganization();

  return (
    <aside
      className="fixed left-0 top-16 z-40 hidden h-[calc(100vh-4rem)] w-60 flex-col bg-[#0b1733] text-slate-300 md:flex"
      aria-label="Amberd Lite navigation"
    >
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title} className="mb-5">
            <p className="px-3 pb-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = isNavActive(pathname, item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400',
                        isActive
                          ? 'bg-blue-600/90 font-medium text-white shadow-sm'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white',
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden />
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <label htmlFor="amberd-org" className="px-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Organization
        </label>
        <select
          id="amberd-org"
          value={organizationId ?? ''}
          onChange={(event) => setActiveOrganization(event.target.value)}
          className="mt-1 w-full rounded-md border border-white/10 bg-white/5 px-2 py-1.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-400"
        >
          {organizations.map((org) => (
            <option key={org.id} value={org.id} className="text-slate-900">
              {org.name}
            </option>
          ))}
        </select>
        <p className="mt-2 px-1 text-[10px] text-slate-500">Amberd Lite · Hackathon Demo build</p>
      </div>
    </aside>
  );
};
