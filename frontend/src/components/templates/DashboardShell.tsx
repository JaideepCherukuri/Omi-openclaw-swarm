"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";

import { SignedIn, useAuth } from "@/auth/clerk";

import { ApiError } from "@/api/mutator";
import {
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
} from "@/api/generated/users/users";
import { BrandMark } from "@/components/atoms/BrandMark";
import { OrgSwitcher } from "@/components/organisms/OrgSwitcher";
import { UserMenu } from "@/components/organisms/UserMenu";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { isOnboardingComplete } from "@/lib/onboarding";
import { Menu, X, BarChart3, Activity, Folder, LayoutGrid, Tags, CheckCircle2, Settings, Store, Boxes, Building2, Network, Bot, Crown } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const isOnboardingPath = pathname === "/onboarding";
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn) && !isOnboardingPath,
      retry: false,
      refetchOnMount: "always",
    },
  });
  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;
  const displayName = profile?.name ?? profile?.preferred_name ?? "Operator";
  const displayEmail = profile?.email ?? "";

  useEffect(() => {
    if (!isSignedIn || isOnboardingPath) return;
    if (!profile) return;
    if (!isOnboardingComplete(profile)) {
      router.replace("/onboarding");
    }
  }, [isOnboardingPath, isSignedIn, profile, router]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== "openclaw_org_switch" || !event.newValue) return;
      window.location.reload();
    };

    window.addEventListener("storage", handleStorage);

    let channel: BroadcastChannel | null = null;
    if ("BroadcastChannel" in window) {
      channel = new BroadcastChannel("org-switch");
      channel.onmessage = () => {
        window.location.reload();
      };
    }

    return () => {
      window.removeEventListener("storage", handleStorage);
      channel?.close();
    };
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen bg-app text-strong">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between px-4 lg:grid lg:grid-cols-[260px_1fr_auto] lg:gap-0 lg:py-3">
          {/* Left: Brand + Mobile menu button */}
          <div className="flex items-center gap-3 py-3 lg:px-6 lg:py-0">
            {/* Mobile menu button */}
            <SignedIn>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 lg:hidden"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
              >
                {mobileMenuOpen ? (
                  <X className="h-5 w-5" />
                ) : (
                  <Menu className="h-5 w-5" />
                )}
              </button>
            </SignedIn>
            <BrandMark />
          </div>

          {/* Center: Org switcher */}
          <SignedIn>
            <div className="hidden items-center lg:flex">
              <div className="max-w-[220px]">
                <OrgSwitcher />
              </div>
            </div>
          </SignedIn>

          {/* Right: User info + Theme toggle */}
          <SignedIn>
            <div className="flex items-center gap-3 py-3 lg:px-6 lg:py-0">
              <ThemeToggle className="hidden sm:flex" />
              <div className="hidden text-right lg:block">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {displayName}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Operator</p>
              </div>
              <UserMenu displayName={displayName} displayEmail={displayEmail} />
            </div>
          </SignedIn>
        </div>
      </header>

      {/* Main content area with grid layout */}
      <div className="flex min-h-[calc(100vh-64px)] bg-slate-50 dark:bg-slate-950">
        {/* Desktop sidebar - shown in children for lg+ */}
        {/* Mobile sidebar overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Mobile sidebar drawer */}
        <div
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 transform transition-transform duration-300 ease-in-out lg:hidden",
            "top-16", // Below header
            mobileMenuOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <MobileNavigation pathname={pathname} onClose={() => setMobileMenuOpen(false)} />
        </div>

        {/* Children render their own sidebar for desktop, main content flows here */}
        {children}
      </div>
      
      {/* Serayah AI Chat - only shown when signed in */}
    </div>
  );
}

function MobileNavigation({ pathname, onClose }: { pathname: string; onClose: () => void }) {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-y-auto">
      <div className="flex-1 px-3 py-4">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Navigation
        </p>
        <nav className="mt-3 space-y-4 text-sm">
          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Overview
            </p>
            <div className="mt-1 space-y-1">
              <MobileNavLink href="/dashboard" pathname={pathname} onClick={onClose}>
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </MobileNavLink>
              <MobileNavLink href="/activity" pathname={pathname} onClick={onClose}>
                <Activity className="h-4 w-4" />
                Live feed
              </MobileNavLink>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Boards
            </p>
            <div className="mt-1 space-y-1">
              <MobileNavLink href="/board-groups" pathname={pathname} onClick={onClose}>
                <Folder className="h-4 w-4" />
                Board groups
              </MobileNavLink>
              <MobileNavLink href="/boards" pathname={pathname} onClick={onClose}>
                <LayoutGrid className="h-4 w-4" />
                Boards
              </MobileNavLink>
              <MobileNavLink href="/tags" pathname={pathname} onClick={onClose}>
                <Tags className="h-4 w-4" />
                Tags
              </MobileNavLink>
              <MobileNavLink href="/approvals" pathname={pathname} onClick={onClose}>
                <CheckCircle2 className="h-4 w-4" />
                Approvals
              </MobileNavLink>
              {isAdmin && (
                <MobileNavLink href="/custom-fields" pathname={pathname} onClick={onClose}>
                  <Settings className="h-4 w-4" />
                  Custom fields
                </MobileNavLink>
              )}
            </div>
          </div>

          {isAdmin && (
            <div>
              <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Skills
              </p>
              <div className="mt-1 space-y-1">
                <MobileNavLink href="/skills/marketplace" pathname={pathname} onClick={onClose}>
                  <Store className="h-4 w-4" />
                  Marketplace
                </MobileNavLink>
                <MobileNavLink href="/skills/packs" pathname={pathname} onClick={onClose}>
                  <Boxes className="h-4 w-4" />
                  Packs
                </MobileNavLink>
              </div>
            </div>
          )}

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
              Administration
            </p>
            <div className="mt-1 space-y-1">
              <MobileNavLink href="/organization" pathname={pathname} onClick={onClose}>
                <Building2 className="h-4 w-4" />
                Organization
              </MobileNavLink>
              {isAdmin && (
                <>
                  <MobileNavLink href="/gateways" pathname={pathname} onClick={onClose}>
                    <Network className="h-4 w-4" />
                    Gateways
                  </MobileNavLink>
                  <MobileNavLink href="/agents" pathname={pathname} onClick={onClose}>
                    <Bot className="h-4 w-4" />
                    Agents
                  </MobileNavLink>
                </>
              )}
            </div>
          </div>
        </nav>
      </div>
    </aside>
  );
}

function MobileNavLink({
  href,
  pathname,
  onClick,
  children,
}: {
  href: string;
  pathname: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  const isActive =
    href === "/dashboard"
      ? pathname === href
      : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      onClick={onClick}
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