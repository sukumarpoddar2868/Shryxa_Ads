"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@/components/ui/field";

export function LeadClientPicker({ clients, value }: { clients: { id: number; name: string }[]; value: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Select
      aria-label="Client"
      aria-busy={pending}
      className="h-10 bg-paper sm:w-64"
      value={value}
      onChange={(e) => start(() => router.replace(`/leads?client=${e.target.value}`, { scroll: false }))}
    >
      {clients.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </Select>
  );
}
