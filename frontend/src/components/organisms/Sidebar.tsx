"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Settings,
  Network,
  Tag,
  Layers,
  Building2,
  Store,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

type NavItem = {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number | string;
  isActive?: boolean;
};

type NavSection = {
  id: string;
  label: string;
  items: NavItem[];
};

export function Sidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    },
  );

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "operational" | "degraded" | "unknown" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";

  const navSections: NavSection[] = [
    {
      id: "overview",
      label: "Overview",
      items: [
        {
          id: "dashboard",
          label: "Dashboard",
          href: "/dashboard",
          icon: BarChart3,
        },
        {
          id: "activity",
          label: "Live Feed",
          href: "/activity",
          icon: Activity,
        },
      ],
    },
    {
      id: "boards",
      label: "Boards",
      items: [
        {
          id: "board-groups",
          label: "Board Groups",
          href: "/board-groups",
          icon: Layers,
        },
        {
          id: "boards",
          label: "Boards",
          href: "/boards",
          icon: Tag,
        },
        {
          id: "approvals",
          label: "Approvals",
          href: "/approvals",
          icon: CheckCircle2,
        },
        ...(isAdmin
          ? [
              {
                id: "custom-fields",
                label: "Custom Fields",
                href: "/custom-fields",
                icon: Settings,
              },
            ]
          : []),
      ],
    },
    ...(isAdmin
      ? [
          {
            id: "skills",
            label: "Skills",
            items: [
              {
                id: "marketplace",
                label: "Marketplace",
                href: "/skills/marketplace",
                icon: Store,
              },
              {
                id: "packs",
                label: "Packs",
                href: "/skills/packs",
                icon: Boxes,
              },
            ],
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            id: "admin",
            label: "Administration",
            items: [
              {
                id: "organization",
                label: "Organization",
                href: "/organization",
                icon: Building2,
              },
              {
                id: "gateways",
                label: "Gateways",
                href: "/gateways",
                icon: Network,
              },
              {
                id: "agents",
                label: "Agents",
                href: "/agents",
                icon: Bot,
              },
            ],
          },
        ]
      : []),
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") {
      return pathname === "/dashboard";
    }
    return pathname.startsWith(href);
  };

  return (
    <aside className="flex h-full w-60 flex-col bg-slate-50 dark:bg-slate-900/50 border-r border-slate-200 dark:border-slate-800">
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        {navSections.map((section) => (
          <div key={section.id} className="mb-4 last:mb-0">
            <p className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              {section.label}
            </p>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);

                return (
                  <Link
                    key={item.id}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium",
                      "transition-all duration-150",
                      active
                        ? "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400"
                        : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 flex-shrink-0",
                        active
                          ? "text-blue-500 dark:text-blue-400"
                          : "text-slate-400 dark:text-slate-500",
                      )}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="ml-auto flex-shrink-0 rounded-full bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 text-xs font-medium text-blue-600 dark:text-blue-400">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* System status */}
      <div className="border-t border-slate-200 dark:border-slate-800 p-3">
        <div className="flex items-center gap-2 rounded-lg bg-white dark:bg-slate-800/50 px-3 py-2 text-xs">
          <span
            className={cn(
              "relative flex h-2 w-2 flex-shrink-0",
            )}
          >
            {systemStatus === "operational" && (
              <>
                <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
              </>
            )}
            {systemStatus === "degraded" && (
              <>
                <span className="absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75 animate-ping" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]" />
              </>
            )}
            {systemStatus === "unknown" && (
              <span className="relative inline-flex h-2 w-2 rounded-full bg-slate-400" />
            )}
          </span>
          <span className="text-slate-500 dark:text-slate-400">
            {systemStatus === "operational" && "All systems operational"}
            {systemStatus === "degraded" && "System degraded"}
            {systemStatus === "unknown" && "Checking status..."}
          </span>
        </div>
      </div>
    </aside>
  );
}

/* Alternative minimal sidebar for condensed layouts */
export function SidebarCompact() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const mainItems = [
    { id: "dashboard", href: "/dashboard", icon: BarChart3, label: "Dashboard" },
    { id: "activity", href: "/activity", icon: Activity, label: "Activity" },
    { id: "boards", href: "/boards", icon: Tag, label: "Boards" },
    ...(isAdmin ? [{ id: "agents", href: "/agents", icon: Bot, label: "Agents" }] : []),
  ];

  const isActive = (href: string) => {
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname.startsWith(href);
  };

  return (
    <aside className="flex h-full w-14 flex-col items-center py-4 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
      {mainItems.map((item) => {
        const Icon = item.icon;
        const active = isActive(item.href);

        return (
          <Link
            key={item.id}
            href={item.href}
            className={cn(
              "flex h-10 w-10 items-center justify-center rounded-lg mb-1",
              "transition-all duration-150",
              active
                ? "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                : "text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-white",
            )}
            title={item.label}
          >
            <Icon className="h-5 w-5" />
          </Link>
        );
      })}
    </aside>
  );
}