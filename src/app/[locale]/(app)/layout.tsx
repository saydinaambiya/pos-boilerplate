import { ResultProvider } from "@/components/feedback/result-provider";
import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/config/env";
import { countPendingForViewer } from "@/features/approvals/service";
import { CapacityBanner } from "@/features/capacity/components/capacity-banner";
import { getCapacityWarning } from "@/features/capacity/service";
import { requireSession } from "@/lib/auth/guard";

/**
 * Signed-in shell. `modal` is the parallel slot for dialogs opened over the
 * current page by intercepted routes, such as the devices list (ADR-0030).
 */
export default async function AppLayout({ children, modal }: LayoutProps<"/[locale]">) {
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
      <ResultProvider>
        {children}
        {modal}
      </ResultProvider>
    </AppShell>
  );
}
