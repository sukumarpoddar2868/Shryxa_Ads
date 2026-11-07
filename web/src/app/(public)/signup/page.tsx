import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/auth-frame";
import { SignupForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Start free trial" };

export default function SignupPage() {
  return (
    <AuthFrame title="Start your free trial" subtitle="2 days free. No card needed to start.">
      <SignupForm />
    </AuthFrame>
  );
}
