import { ShieldX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";

/** Rendered with HTTP 403 when `requirePermission` fails (FR-RBAC-02). */
export default async function Forbidden() {
  const t = await getTranslations("Forbidden");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<ShieldX aria-hidden="true" />}
        title={t("title")}
        description={t("description")}
        action={
          <Button asChild variant="secondary">
            <Link href="/">{t("back")}</Link>
          </Button>
        }
      />
    </main>
  );
}
