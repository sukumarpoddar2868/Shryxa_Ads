import { z } from "zod";

export const CURRENCIES = ["INR", "USD"] as const;

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ message: "Enter a valid email address." }));

export const LoginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password."),
});

export const ACCOUNT_TYPES = ["business", "agency"] as const;

export const SignupSchema = z.object({
  email,
  password: z.string().min(8, "Password must be at least 8 characters."),
  currency: z.enum(CURRENCIES, { message: "Currency must be INR or USD." }),
  accountType: z.enum(ACCOUNT_TYPES, { message: "Choose how you'll use Shryxa Ads." }),
});

/** Shape returned by auth server actions to `useActionState`. */
export type AuthFormState = {
  error?: string;
  fieldErrors?: Partial<Record<"email" | "password" | "currency" | "accountType", string>>;
  values?: { email?: string; currency?: string; accountType?: string };
};
