import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/config/env";
import { countPendingForViewer } from "@/features/approvals/service";
import { requireSession } from "@/lib/auth/guard";

export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const session = await requireSession();
  const pendingApprovals = await countPendingForViewer(session);
  return (
    <AppShell
      showDiagnostics={env.ENABLE_DIAGNOSTICS}
      permissions={session.permissions}
      badges={{ "/approvals": pendingApprovals }}
    >
      {children}
    </AppShell>
  );
}
