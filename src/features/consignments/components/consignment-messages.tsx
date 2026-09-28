import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";

/** Client catalogs the consignment forms need: their own, the POS buyer fields and pickers. */
export async function ConsignmentMessages({ children }: { children: ReactNode }) {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      messages={{
        Consignments: messages.Consignments,
        Pos: messages.Pos,
        Feedback: messages.Feedback,
        Picker: messages.Picker,
      }}
    >
      {children}
    </NextIntlClientProvider>
  );
}
