import "server-only";
import bcrypt from "bcryptjs";

// Compatible with the legacy Python bcrypt hashes ($2b$, 12 rounds by default).
const ROUNDS = 12;

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hash);
  } catch {
    return false;
  }
}
