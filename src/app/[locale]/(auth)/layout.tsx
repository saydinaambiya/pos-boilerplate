import { BrandLogo } from "@/components/shell/brand-logo";
import { Preferences } from "@/components/shell/preferences";
import { Card } from "@/components/ui/card";

/** Standalone frame for sign-in and onboarding pages, outside the app shell. */
export default function AuthLayout({ children }: LayoutProps<"/[locale]">) {
  return (
    <main
      id="main"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-surface-muted px-4 py-10"
    >
      <BrandLogo className="h-10" />
      <Card className="w-full max-w-sm">{children}</Card>
      <Preferences className="justify-center" />
    </main>
  );
}
