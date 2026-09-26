import { ScrollText } from "lucide-react";
import type { Metadata } from "next";
import { getFormatter, getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { parseAuditFilters } from "@/features/audit/schemas";
import { getAuditActors, listAuditLogs } from "@/features/audit/service";
import { Link } from "@/i18n/navigation";
import { type AuditAction, auditActionMessageKey, auditActions } from "@/lib/audit/actions";
import { requirePermission } from "@/lib/auth/guard";
import type messages from "@/messages/id.json";

type ActionKey = keyof (typeof messages)["Audit"]["actions"];
type EntityKey = keyof (typeof messages)["Audit"]["entities"];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Audit");
  return { title: t("title") };
}

/** Filterable, read-only audit trail (FR-AUD-03/04). */
export default async function AuditPage({ searchParams }: PageProps<"/[locale]/audit">) {
  const session = await requirePermission("page:audit");
  await requirePermission("audit:view");
  const filters = parseAuditFilters(await searchParams);
  const [t, format, actors, page] = await Promise.all([
    getTranslations("Audit"),
    getFormatter(),
    getAuditActors(session),
    listAuditLogs(session, filters),
  ]);

  const actionLabel = (action: string) =>
    (auditActions as readonly string[]).includes(action)
      ? t(`actions.${auditActionMessageKey(action as AuditAction) as ActionKey}`)
      : action;
  const entityLabel = (entity: string) => (isEntity(entity) ? t(`entities.${entity}`) : entity);
  const activeFilters = Object.fromEntries(
    Object.entries(filters).filter(([name]) => name !== "cursor"),
  );

  return (
    <>
      <PageHeader title={t("title")} description={t("subtitle")} />

      <Card className="mb-6">
        <form method="get" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
          <Field label={t("actor")}>
            {(control) => (
              <Select {...control} name="actor" defaultValue={filters.actor ?? ""}>
                <option value="">{t("allActors")}</option>
                {actors.map((actor) => (
                  <option key={actor.id} value={actor.id}>
                    {`${actor.name} (${actor.username})`}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("action")}>
            {(control) => (
              <Select {...control} name="action" defaultValue={filters.action ?? ""}>
                <option value="">{t("allActions")}</option>
                {auditActions.map((action) => (
                  <option key={action} value={action}>
                    {actionLabel(action)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t("from")}>
            {(control) => (
              <Input {...control} type="date" name="from" defaultValue={filters.from ?? ""} />
            )}
          </Field>
          <Field label={t("to")}>
            {(control) => (
              <Input {...control} type="date" name="to" defaultValue={filters.to ?? ""} />
            )}
          </Field>
          <div className="flex gap-2">
            <Button type="submit">{t("apply")}</Button>
            <Button asChild variant="ghost">
              <Link href="/audit">{t("reset")}</Link>
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {page.entries.length === 0 ? (
          <EmptyState
            icon={<ScrollText aria-hidden="true" />}
            title={t("emptyTitle")}
            description={t("emptyDescription")}
          />
        ) : (
          <Table>
            <TableCaption>{t("listCaption")}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>{t("time")}</TableHead>
                <TableHead>{t("actor")}</TableHead>
                <TableHead>{t("action")}</TableHead>
                <TableHead>{t("entity")}</TableHead>
                <TableHead>{t("ip")}</TableHead>
                <TableHead>{t("details")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {page.entries.map((entry) => (
                <TableRow key={entry.id} className="align-top">
                  <TableCell className="whitespace-nowrap">
                    <time dateTime={entry.createdAt.toISOString()}>
                      {format.dateTime(entry.createdAt, {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </time>
                  </TableCell>
                  <TableCell>
                    {entry.actorName ?? <span className="text-ink-muted">{t("unknownActor")}</span>}
                  </TableCell>
                  <TableCell>{actionLabel(entry.action)}</TableCell>
                  <TableCell>
                    {entityLabel(entry.entity)}
                    {entry.entityId ? (
                      <span className="block text-xs text-ink-muted">{entry.entityId}</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-ink-muted">{entry.ip ?? "—"}</TableCell>
                  <TableCell className="min-w-56">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">
                        {t("showDetails")}
                      </summary>
                      <dl className="mt-2 flex flex-col gap-2 text-xs">
                        {entry.diff ? (
                          <div>
                            <dt className="font-medium text-ink-muted">{t("changes")}</dt>
                            <dd>
                              <pre className="mt-1 max-w-md overflow-x-auto rounded-control bg-surface-muted p-2 break-all whitespace-pre-wrap">
                                {JSON.stringify(entry.diff, null, 2)}
                              </pre>
                            </dd>
                          </div>
                        ) : null}
                        <div>
                          <dt className="font-medium text-ink-muted">{t("userAgent")}</dt>
                          <dd className="break-all">{entry.userAgent ?? "—"}</dd>
                        </div>
                        <div>
                          <dt className="font-medium text-ink-muted">{t("requestId")}</dt>
                          <dd className="break-all">{entry.requestId ?? "—"}</dd>
                        </div>
                      </dl>
                    </details>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          {filters.cursor ? (
            <Button asChild variant="ghost">
              <Link href={{ pathname: "/audit", query: activeFilters }}>{t("newest")}</Link>
            </Button>
          ) : null}
          {page.nextCursor ? (
            <Button asChild variant="secondary">
              <Link
                href={{ pathname: "/audit", query: { ...activeFilters, cursor: page.nextCursor } }}
              >
                {t("older")}
              </Link>
            </Button>
          ) : null}
        </div>
      </Card>
    </>
  );
}

const ENTITIES = new Set<string>(["user", "role", "settings", "bank-account", "marketplace"]);

function isEntity(value: string): value is EntityKey {
  return ENTITIES.has(value);
}
