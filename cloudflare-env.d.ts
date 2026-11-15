interface CloudflareEnv {
  CRM_DB: D1Database;
  CRM_DOCUMENTS: R2Bucket;
  CRM_PUBLIC_URL?: string;
  AUTH_ISSUER?: string;
  PANIGALE_AUTH_CLIENT_ID?: string;
  CRM_BOOTSTRAP_OWNER_EMAIL?: string;
}

declare namespace Cloudflare {
  type Env = CloudflareEnv;
}
