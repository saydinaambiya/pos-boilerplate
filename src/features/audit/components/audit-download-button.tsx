"use client";

import { Download } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useShowResult } from "@/components/feedback/result-provider";
import { Button } from "@/components/ui/button";

interface AuditDownloadButtonProps {
  from: string;
  to: string;
  labels: { download: string; downloading: string; downloaded: string; failed: string };
}

/**
 * Downloads a range of the audit log as CSV and refreshes the page once the
 * whole file has arrived, so the delete step unlocks only after a complete
 * download (FR-AUD-05).
 */
export function AuditDownloadButton({ from, to, labels }: AuditDownloadButtonProps) {
  const router = useRouter();
  const showResult = useShowResult();
  const [pending, setPending] = useState(false);

  const download = async () => {
    setPending(true);
    try {
      const query = new URLSearchParams({ from, to });
      const response = await fetch(`/api/v1/audit/export?${query.toString()}`);
      if (!response.ok) throw new Error(`Export failed with ${String(response.status)}`);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `audit-log-${from}-${to}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      showResult?.({ status: "success", message: labels.downloaded });
      router.refresh();
    } catch {
      showResult?.({ status: "error", message: labels.failed });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      aria-busy={pending}
      onClick={() => {
        void download();
      }}
      className="self-start"
    >
      <Download aria-hidden="true" />
      {pending ? labels.downloading : labels.download}
    </Button>
  );
}
