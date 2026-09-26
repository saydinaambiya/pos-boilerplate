import { AppShell } from "@/components/shell/app-shell";
import { env } from "@/config/env";

export default function AppLayout({ children }: LayoutProps<"/[locale]">) {
  return <AppShell showDiagnostics={env.ENABLE_DIAGNOSTICS}>{children}</AppShell>;
}
