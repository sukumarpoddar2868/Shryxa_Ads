import type { Metadata } from "next";
import { Suspense } from "react";
import { getLegalDoc } from "@/features/legal/content";
import { LegalPage } from "@/features/legal/legal-page";
import { parseConfirmationCode } from "@/features/meta-connect/signed-request";

export const metadata: Metadata = { title: "Data Deletion" };

export default function Page({ searchParams }: PageProps<"/data-deletion">) {
  return (
    <LegalPage
      doc={getLegalDoc("data-deletion")}
      notice={
        <Suspense fallback={null}>
          <Status searchParams={searchParams} />
        </Suspense>
      }
    />
  );
}

async function Status({ searchParams }: { searchParams: PageProps<"/data-deletion">["searchParams"] }) {
  const sp = await searchParams;
  const code = typeof sp.code === "string" ? sp.code : "";
  if (!code) return null;
  const parsed = parseConfirmationCode(code);
  return (
    <div role="status" className={`mb-10 rounded-[10px] px-5 py-4 text-[15px] ${parsed ? "bg-chartreuse-soft" : "bg-tomato-soft text-tomato-700"}`}>
      {parsed ? (
        <>
          <strong>Deletion complete.</strong> Request <code className="font-bold">{code}</code> was received on{" "}
          {new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" }).format(parsed.at)} and your Facebook data was deleted from Shryxa Ads right away.
        </>
      ) : (
        <>That confirmation code isn&apos;t valid. Check the link from Facebook or contact us.</>
      )}
    </div>
  );
}
