const PAGE_SIZE = 200;

/**
 * Mirror the CRM's immutable, versioned document objects to the private recovery bucket.
 * Document uploads use a new storage key for each version, so the backup bucket can retain
 * prior versions without deleting objects when a CRM record is archived.
 */
export async function backupCrmDocuments(db, sourceBucket, backupBucket, timestamp = new Date().toISOString()) {
  if (!db || !sourceBucket || !backupBucket) throw Object.assign(new Error("CRM document backup bindings are unavailable."), { code: "bindings_unavailable" });
  const cutoff = new Date(timestamp).toISOString();
  let lastId = "", copied = 0, skipped = 0, missing = 0, failed = 0;
  for (;;) {
    const page = await db.prepare(`SELECT id,storage_key FROM crm_documents
      WHERE datetime(created_at)<=datetime(?) AND id>?
      ORDER BY id LIMIT ${PAGE_SIZE}`).bind(cutoff, lastId).all();
    const rows = page.results || [];
    if (!rows.length) break;
    for (const row of rows) {
      lastId = String(row.id);
      try {
        const [source, backup] = await Promise.all([
          sourceBucket.head(String(row.storage_key)),
          backupBucket.head(String(row.storage_key)),
        ]);
        if (!source) { missing++; continue; }
        if (backup && backup.etag === source.etag && Number(backup.size) === Number(source.size)) { skipped++; continue; }
        const object = await sourceBucket.get(String(row.storage_key));
        if (!object) { missing++; continue; }
        await backupBucket.put(String(row.storage_key), object.body, {
          httpMetadata: object.httpMetadata,
          customMetadata: object.customMetadata,
        });
        copied++;
      } catch {
        failed++;
      }
    }
    if (rows.length < PAGE_SIZE) break;
  }
  const result = { copied, skipped, missing, failed };
  if (missing || failed) throw Object.assign(new Error("CRM document backup did not copy every indexed object."), { code: "incomplete", result });
  return result;
}
