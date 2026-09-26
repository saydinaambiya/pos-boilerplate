import { SearchX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("NotFound");

  return (
    <main className="flex min-h-dvh items-center justify-center p-6">
      <EmptyState
        icon={<SearchX aria-hidden="true" />}
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
