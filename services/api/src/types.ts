import type { AuditEventDto } from "@fidt/contracts";

export interface Env {
  readonly FIDT_DB: D1Database;
  readonly CACHE: KVNamespace;
  readonly APP_ENV: "development" | "demo" | "production";
  readonly OPENROUTER_API_KEY?: string;
  readonly OPENROUTER_MODEL?: string;
  readonly PASSPORT_SIGNING_SECRET?: string;
  readonly APP_PUBLIC_URL?: string;
  readonly CF_ACCESS_TEAM_DOMAIN?: string;
  readonly CF_ACCESS_AUD?: string;
  readonly SEC_USER_AGENT?: string;
}

export interface AdvisorIdentity {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

export interface Variables {
  readonly requestId: string;
  readonly advisor: AdvisorIdentity;
}

export type Bindings = Env;

export interface StoredAuditEvent extends AuditEventDto {
  readonly metadata: Readonly<Record<string, unknown>>;
}
