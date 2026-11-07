/**
 * Hand-written types mirroring supabase/migrations/0001_initial_schema.sql.
 * Replace with generated types once the project ref is available:
 *   pnpm dlx supabase gen types typescript --project-id <ref> > src/lib/supabase/types.ts
 * Mirrors the columns the legacy Python app (auth/db.py) reads and writes.
 */

type Row<T> = { Row: T; Insert: Partial<T>; Update: Partial<T>; Relationships: [] };

export type UserRow = {
  id: number;
  email: string;
  password_hash: string;
  currency: "INR" | "USD";
  created_at: string;
  trial_ends_at: string | null;
  tier: "starter" | "agency_lite" | "agency_standard" | "agency_pro";
  client_limit: number;
  team_seats: number;
  is_admin: number; // 0 | 1 (legacy-compatible)
  account_type: "business" | "agency";
};

export type SessionRow = {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string;
};

export type SubscriptionRow = {
  user_id: number;
  status: "trialing" | "active" | "past_due" | "canceled" | "expired";
  provider: string | null;
  razorpay_subscription_id: string | null;
  razorpay_customer_id: string | null;
  current_period_end: string | null;
  last_polled_at: string | null;
  paused_campaign_ids: string | null;
};

export type ClientRow = {
  id: number;
  user_id: number;
  ad_account_id: string | null;
  page_id: string | null;
  business_name: string | null;
  created_at: string;
  service_model: "self_service" | "agency_managed";
  billing_arrangement: "management_fee_only" | "management_plus_ad_budget" | null;
  client_status: "pending_access" | "active" | "paused";
  is_self: boolean;
  meta_connection_id: number | null;
  ad_account_name: string | null;
  page_name: string | null;
  instagram_actor_id: string | null;
  instagram_username: string | null;
  pixel_id: string | null;
  pixel_name: string | null;
  assets_updated_at: string | null;
};

export type MetaConnectionRow = {
  id: number;
  user_id: number;
  client_id: number | null;
  meta_user_id: string | null;
  meta_user_name: string | null;
  ad_account_id: string | null;
  ad_account_name: string | null;
  access_token_encrypted: string;
  token_expires_at: string | null;
  connected_at: string;
  updated_at: string;
  connection_status: "connected" | "expired" | "revoked" | "error";
  source: "owner" | "invite" | "business";
  token_type: "user" | "system_user";
  granted_scopes: string[] | null;
  meta_business_id: string | null;
};

export type ClientInviteRow = {
  id: number;
  token_hash: string;
  user_id: number;
  client_id: number;
  created_at: string;
  expires_at: string;
  used_at: string | null;
};

export type MetaOAuthStateRow = {
  id: number;
  state_hash: string;
  user_id: number;
  client_id: number;
  created_at: string;
  expires_at: string;
  flow: "owner" | "invite" | "business";
  invite_id: number | null;
};

export type MetaOAuthPendingRow = {
  id: number;
  ticket_hash: string;
  user_id: number;
  client_id: number;
  meta_user_id: string | null;
  meta_user_name: string | null;
  accounts: unknown;
  access_token_encrypted: string;
  token_expires_at: string | null;
  created_at: string;
  expires_at: string;
};

export type Database = {
  public: {
    Tables: {
      users: Row<UserRow>;
      sessions: Row<SessionRow>;
      subscriptions: Row<SubscriptionRow>;
      clients: Row<ClientRow>;
      meta_connections: Row<MetaConnectionRow>;
      meta_oauth_states: Row<MetaOAuthStateRow>;
      meta_oauth_pending: Row<MetaOAuthPendingRow>;
      client_invites: Row<ClientInviteRow>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
