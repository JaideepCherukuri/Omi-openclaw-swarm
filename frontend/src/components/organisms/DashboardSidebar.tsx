"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Crown,
  Folder,
  Building2,
  LayoutGrid,
  Network,
  Settings,
  Store,
  Tags,
} from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import { cn } from "@/lib/utils";

export function DashboardSidebar() {
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
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "System status unavailable"
        : "System degraded";

  return (
    <aside className="hidden lg:flex h-full w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Navigation
        </p>
        <nav className="mt-3 space-y-4 text-sm">
          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Overview
            </p>
            <div className="mt-1 space-y-1">
              <NavLink href="/dashboard" pathname={pathname}>
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </NavLink>
              <NavLink href="/dashboard/serayah" pathname={pathname}>
                <Crown className="h-4 w-4" />
                Serayah
              </NavLink>
              <NavLink href="/activity" pathname={pathname}>
                <Activity className="h-4 w-4" />
                Live feed
              </NavLink>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Boards
            </p>
            <div className="mt-1 space-y-1">
              <NavLink href="/board-groups" pathname={pathname}>
                <Folder className="h-4 w-4" />
                Board groups
              </NavLink>
              <NavLink href="/boards" pathname={pathname}>
                <LayoutGrid className="h-4 w-4" />
                Boards
              </NavLink>
              <NavLink href="/tags" pathname={pathname}>
                <Tags className="h-4 w-4" />
                Tags
              </NavLink>
              <NavLink href="/approvals" pathname={pathname}>
                <CheckCircle2 className="h-4 w-4" />
                Approvals
              </NavLink>
              {isAdmin ? (
                <NavLink href="/custom-fields" pathname={pathname}>
                  <Settings className="h-4 w-4" />
                  Custom fields
                </NavLink>
              ) : null}
            </div>
          </div>

          <div>
            {isAdmin ? (
              <>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Skills
                </p>
                <div className="mt-1 space-y-1">
                  <NavLink href="/skills/marketplace" pathname={pathname}>
                    <Store className="h-4 w-4" />
                    Marketplace
                  </NavLink>
                  <NavLink href="/skills/packs" pathname={pathname}>
                    <Boxes className="h-4 w-4" />
                    Packs
                  </NavLink>
                </div>
              </>
            ) : null}
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Administration
            </p>
            <div className="mt-1 space-y-1">
              <NavLink href="/organization" pathname={pathname}>
                <Building2 className="h-4 w-4" />
                Organization
              </NavLink>
              {isAdmin ? (
                <NavLink href="/gateways" pathname={pathname}>
                  <Network className="h-4 w-4" />
                  Gateways
                </NavLink>
              ) : null}
              {isAdmin ? (
                <NavLink href="/agents" pathname={pathname}>
                  <Bot className="h-4 w-4" />
                  Agents
                </NavLink>
              ) : null}
            </div>
          </div>
        </nav>
      </div>
      <div className="border-t border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <span
            className={cn(
              "h-2 w-2 rounded-full",
              systemStatus === "operational" && "bg-emerald-500",
              systemStatus === "degraded" && "bg-rose-500",
              systemStatus === "unknown" && "bg-slate-300 dark:bg-slate-600",
            )}
          />
          {statusLabel}
        </div>
      </div>
    </aside>
  );
}

function NavLink({
  href,
  pathname,
  children,
}: {
  href: string;
  pathname: string;
  children: React.ReactNode;
}) {
  const isActive =
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all",
        isActive
          ? "bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 font-medium"
          : "text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
      )}
    >
      {children}
    </Link>
  );
}