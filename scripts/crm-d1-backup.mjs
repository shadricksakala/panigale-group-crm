import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { appendFile, open, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("PANIGALE-CRM-D1-BACKUP-V1\n", "ascii");
const AAD = Buffer.from("panigale-group-crm-production:d1-export:v1", "ascii");
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function keyFromEnvironment() {
  const value = String(process.env.CRM_BACKUP_ENCRYPTION_KEY || "").trim();
  let key;
  try { key = Buffer.from(value, "base64"); }
  catch { throw new Error("CRM_BACKUP_ENCRYPTION_KEY must be a base64-encoded 32-byte key."); }
  if (key.length !== 32 || key.toString("base64") !== value) throw new Error("CRM_BACKUP_ENCRYPTION_KEY must be a canonical base64-encoded 32-byte key.");
  return key;
}

async function decryptTo(input, output, key) {
  const size = (await stat(input)).size;
  const minimum = MAGIC.length + IV_LENGTH + TAG_LENGTH + 1;
  if (size < minimum) throw new Error("Encrypted backup is too small or truncated.");
  const file = await open(input, "r");
  const header = Buffer.alloc(MAGIC.length + IV_LENGTH);
  const tag = Buffer.alloc(TAG_LENGTH);
  try {
    await file.read(header, 0, header.length, 0);
    await file.read(tag, 0, TAG_LENGTH, size - TAG_LENGTH);
  } finally { await file.close(); }
  if (!header.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error("Unsupported CRM backup format.");
  const iv = header.subarray(MAGIC.length);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAAD(AAD);
  decipher.setAuthTag(tag);
  await writeFile(output, Buffer.alloc(0), { flag: "wx", mode: 0o600 });
  try {
    await pipeline(
      createReadStream(input, { start: MAGIC.length + IV_LENGTH, end: size - TAG_LENGTH - 1 }),
      decipher,
      createWriteStream(output, { flags: "a", mode: 0o600 }),
    );
  } catch (error) {
    await rm(output, { force: true });
    throw error;
  }
}

async function main() {
  const mode = process.argv[2];
  const input = argument("--input");
  const output = argument("--output");
  if (!input) throw new Error("Usage: node scripts/crm-d1-backup.mjs <encrypt|decrypt|verify> --input <file> [--output <file>]");
  const key = keyFromEnvironment();

  if (mode === "encrypt") {
    if (!output) throw new Error("Encryption requires --output.");
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(AAD);
    await writeFile(output, Buffer.concat([MAGIC, iv]), { flag: "wx", mode: 0o600 });
    try {
      await pipeline(createReadStream(input), cipher, createWriteStream(output, { flags: "a", mode: 0o600 }));
      await appendFile(output, cipher.getAuthTag());
    } catch (error) {
      await rm(output, { force: true });
      throw error;
    }
    console.log(`Encrypted ${basename(input)} using AES-256-GCM.`);
    return;
  }

  if (mode === "decrypt") {
    if (!output) throw new Error("Decryption requires --output.");
    await decryptTo(input, output, key);
    console.log(`Decrypted backup to ${output}.`);
    return;
  }

  if (mode === "verify") {
    const outputPath = join(tmpdir(), `crm-backup-verify-${process.pid}-${Date.now()}.sql`);
    try {
      await decryptTo(input, outputPath, key);
      const plain = await open(outputPath, "r");
      let sample;
      try {
        const head = Buffer.alloc(64 * 1024);
        const { bytesRead } = await plain.read(head, 0, head.length, 0);
        sample = head.subarray(0, bytesRead).toString("utf8");
      } finally { await plain.close(); }
      if (!sample || !/CREATE TABLE|INSERT INTO|PRAGMA/i.test(sample)) throw new Error("Decrypted content does not look like a D1 SQL export.");
      console.log("Encrypted backup authentication and SQL export format verified.");
    } finally {
      await rm(outputPath, { force: true });
    }
    return;
  }

  throw new Error("Choose encrypt, decrypt, or verify.");
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : "CRM backup operation failed.");
  process.exitCode = 1;
});
