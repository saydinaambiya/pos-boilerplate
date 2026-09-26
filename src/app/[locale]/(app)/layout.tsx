import { ResultProvider } from "@/components/feedback/result-provider";
import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/config/env";
import { countPendingForViewer } from "@/features/approvals/service";
import { CapacityBanner } from "@/features/capacity/components/capacity-banner";
import { getCapacityWarning } from "@/features/capacity/service";
import { requireSession } from "@/lib/auth/guard";

export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const session = await requireSession();
  const [pendingApprovals, capacity] = await Promise.all([
    countPendingForViewer(session),
    getCapacityWarning(session),
  ]);
  return (
    <AppShell
      showDiagnostics={env.ENABLE_DIAGNOSTICS}
      permissions={session.permissions}
      badges={{ "/approvals": pendingApprovals }}
    >
      {capacity ? <CapacityBanner level={capacity.level} percent={capacity.percent} /> : null}
      <ResultProvider>{children}</ResultProvider>
    </AppShell>
  );
}
