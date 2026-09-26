import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/config/env";
import { requireSession } from "@/lib/auth/guard";

export default async function AppLayout({ children }: LayoutProps<"/[locale]">) {
  const session = await requireSession();
  return (
    <AppShell showDiagnostics={env.ENABLE_DIAGNOSTICS} permissions={session.permissions}>
      {children}
    </AppShell>
  );
}
