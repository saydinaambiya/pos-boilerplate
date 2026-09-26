import { Download } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

/** A report section with its own CSV download (FR-RPT-05). */
export function ReportCard({
  id,
  title,
  csvHref,
  csvLabel,
  children,
}: {
  id: string;
  title: string;
  csvHref: string;
  csvLabel: string;
  children: ReactNode;
}) {
  return (
    <Card aria-labelledby={id} className="min-w-0">
      <CardHeader>
        <CardTitle id={id}>{title}</CardTitle>
        <Button asChild variant="ghost" size="sm">
          <a href={csvHref} download>
            <Download aria-hidden="true" />
            {csvLabel}
          </a>
        </Button>
      </CardHeader>
      {children}
    </Card>
  );
}
