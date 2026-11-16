interface CloudflareEnv {
  CRM_DB: D1Database;
  CRM_DOCUMENTS: R2Bucket;
  CRM_PUBLIC_URL?: string;
  AUTH_ISSUER?: string;
  PANIGALE_AUTH_CLIENT_ID?: string;
  CRM_BOOTSTRAP_OWNER_EMAIL?: string;
  CRM_AI_ENABLED?: string;
  CRM_AI_MODEL?: string;
  GOOGLE_OAUTH_CLIENT_ID?: string;
  GOOGLE_OAUTH_CLIENT_SECRET?: string;
  CRM_INTEGRATION_ENCRYPTION_KEY?: string;
  CRM_EMAIL_SEND_ENABLED?: string;
  CRM_READ_ONLY_MODE?: string;
  CRM_SCHEDULED_JOBS_ENABLED?: string;
  CRM_MAILER?: Fetcher;
  CRM_EMAIL?: { send(message: { from: { email: string; name?: string }; to: string; subject: string; text: string }): Promise<unknown> };
  AI?: Ai;
}

declare namespace Cloudflare {
  type Env = CloudflareEnv;
}
