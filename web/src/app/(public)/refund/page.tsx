import type { Metadata } from "next";
import { LegalPage } from "@/features/legal/legal-page";
import { getLegalDoc } from "@/features/legal/content";

export const metadata: Metadata = { title: "Refund & Cancellation Policy" };

export default function Page() {
  return <LegalPage doc={getLegalDoc("refund")} />;
}
