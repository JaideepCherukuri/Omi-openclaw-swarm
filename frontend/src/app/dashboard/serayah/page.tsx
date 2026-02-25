"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Bot,
  ChevronLeft,
  LayoutDashboard,
  Loader2,
  List,
  RefreshCw,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import { SerayahDashboard } from "@/components/serayah/SerayahDashboard";
import { TaskQueueView } from "@/components/serayah/TaskQueueView";

// Loading fallback
function LoadingState() {
  return (
    <div className="p-8">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-8 w-48 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
          <div className="h-8 w-24 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-20 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="h-64 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main page content
function SerayahDashboardPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [refreshing, setRefreshing] = useState(false);

  const defaultTab = searchParams.get("tab") ?? "overview";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", value);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const handleRefresh = () => {
    setRefreshing(true);
    window.location.reload();
  };

  return (
    <>
      <DashboardSidebar />
      <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-slate-950">
        {/* Header */}
        <div className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push("/dashboard")}
                className="h-10 w-10 p-0"
              >
                <ChevronLeft className="h-5 w-5" />
              </Button>
              <div>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center">
                    <Sparkles className="h-4 w-4 text-white" />
                  </div>
                  <h1 className="font-heading text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
                    Serayah Dashboard
                  </h1>
                </div>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Monitor your AI agent tasks and queue
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => router.push("/agents/new")}
              >
                <Bot className="h-4 w-4 mr-2" />
                New Agent
              </Button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="p-4 lg:p-8">
          <Tabs
            value={activeTab}
            onValueChange={handleTabChange}
            className="space-y-6"
          >
            <TabsList className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <TabsTrigger
                value="overview"
                className="data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Overview
              </TabsTrigger>
              <TabsTrigger
                value="queue"
                className="data-[state=active]:bg-slate-100 dark:data-[state=active]:bg-slate-800"
              >
                <List className="h-4 w-4 mr-2" />
                Task Queue
              </TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <Suspense fallback={<LoadingState />}>
                <SerayahDashboard />
              </Suspense>
            </TabsContent>

            <TabsContent value="queue" className="mt-6">
              <Suspense fallback={<LoadingState />}>
                <TaskQueueView />
              </Suspense>
            </TabsContent>
          </Tabs>
        </div>
      </main>
    </>
  );
}

// Export default page component
export default function SerayahDashboardPage() {
  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to access the Serayah dashboard."
          forceRedirectUrl="/onboarding"
          signUpForceRedirectUrl="/onboarding"
        />
      </SignedOut>
      <SignedIn>
        <SerayahDashboardPageContent />
      </SignedIn>
    </DashboardShell>
  );
}
