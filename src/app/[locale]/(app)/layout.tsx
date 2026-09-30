import { ResultProvider } from "@/components/feedback/result-provider";
import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/config/env";
import { countPendingForViewer } from "@/features/approvals/service";
import { CapacityBanner } from "@/features/capacity/components/capacity-banner";
import { getCapacityWarning } from "@/features/capacity/service";
import { RecoveryCodesBanner } from "@/features/auth/components/recovery-codes-banner";
import { getRecoveryCodeStatus } from "@/features/auth/service";
import { requireSession } from "@/lib/auth/guard";

/**
 * Signed-in shell. `modal` is the parallel slot for dialogs opened over the
 * current page by intercepted routes, such as the devices list (ADR-0030).
 * A password account without unused recovery codes sees a banner (ADR-0037).
 */
export default async function AppLayout({ children, modal }: LayoutProps<"/[locale]">) {
  const session = await requireSession();
  const [pendingApprovals, capacity, recovery] = await Promise.all([
    countPendingForViewer(session),
    getCapacityWarning(session),
    getRecoveryCodeStatus(session),
  ]);
  return (
    <AppShell
      showDiagnostics={env.ENABLE_DIAGNOSTICS}
      permissions={session.permissions}
      badges={{ "/approvals": pendingApprovals }}
    >
      {capacity ? <CapacityBanner level={capacity.level} percent={capacity.percent} /> : null}
      {recovery?.unused === 0 ? <RecoveryCodesBanner /> : null}
      <ResultProvider>
        {children}
        {modal}
      </ResultProvider>
    </AppShell>
  );
}
