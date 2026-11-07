import type { Metadata } from "next";
import { AuthFrame } from "@/components/shell/auth-frame";
import { LoginForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthFrame title="Welcome back" subtitle="Sign in to manage your campaigns.">
      <LoginForm />
    </AuthFrame>
  );
}
