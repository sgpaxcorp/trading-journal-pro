import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { createGzip } from "node:zlib";

import { createClient } from "@supabase/supabase-js";

const PAGE_SIZE = 1_000;
const outputRoot = path.resolve(process.argv[2] ?? "");
const schemaFile = path.resolve(process.argv[3] ?? "");

if (!process.argv[2] || !process.argv[3]) {
  throw new Error("Usage: node --env-file=.env.local scripts/release/backup-supabase.mjs <output-dir> <schema.sql>");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

await mkdir(outputRoot, { recursive: true });
await mkdir(path.join(outputRoot, "tables"), { recursive: true });
await mkdir(path.join(outputRoot, "storage"), { recursive: true });

const schemaSql = await readFile(schemaFile, "utf8");
const tableNames = Array.from(
  schemaSql.matchAll(/CREATE TABLE(?: IF NOT EXISTS)? "public"\."([^"]+)"/g),
  (match) => match[1]
).sort();

if (tableNames.length === 0) {
  throw new Error(`No public tables were discovered in ${schemaFile}.`);
}

const manifest = {
  createdAt: new Date().toISOString(),
  source: new URL(supabaseUrl).hostname,
  tables: {},
  authUsers: 0,
  storage: { buckets: 0, objects: 0, bytes: 0 },
  errors: [],
};

async function writeGzippedJsonLines(targetPath, rows) {
  const temporaryPath = `${targetPath}.jsonl`;
  const stream = createWriteStream(temporaryPath, { encoding: "utf8" });
  for (const row of rows) {
    if (!stream.write(`${JSON.stringify(row)}\n`)) {
      await new Promise((resolve) => stream.once("drain", resolve));
    }
  }
  await new Promise((resolve, reject) => stream.end((error) => (error ? reject(error) : resolve())));
  await pipeline(createReadStream(temporaryPath), createGzip({ level: 9 }), createWriteStream(targetPath));
  const { unlink } = await import("node:fs/promises");
  await unlink(temporaryPath);
}

for (const tableName of tableNames) {
  const rows = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.from(tableName).select("*").range(offset, offset + PAGE_SIZE - 1);
    if (error) {
      manifest.errors.push({ scope: `table:${tableName}`, message: error.message });
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  const target = path.join(outputRoot, "tables", `${tableName}.jsonl.gz`);
  await writeGzippedJsonLines(target, rows);
  manifest.tables[tableName] = rows.length;
  process.stdout.write(`table ${tableName}: ${rows.length}\n`);
}

const authUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
  if (error) {
    manifest.errors.push({ scope: "auth.users", message: error.message });
    break;
  }
  authUsers.push(...data.users);
  if (data.users.length < PAGE_SIZE) break;
}
await writeGzippedJsonLines(path.join(outputRoot, "auth-users.jsonl.gz"), authUsers);
manifest.authUsers = authUsers.length;

async function backupStorageFolder(bucketName, prefix = "") {
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase.storage.from(bucketName).list(prefix, {
      limit: PAGE_SIZE,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) {
      manifest.errors.push({ scope: `storage:${bucketName}/${prefix}`, message: error.message });
      return;
    }

    for (const entry of data ?? []) {
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!entry.id) {
        await backupStorageFolder(bucketName, objectPath);
        continue;
      }

      const { data: blob, error: downloadError } = await supabase.storage.from(bucketName).download(objectPath);
      if (downloadError || !blob) {
        manifest.errors.push({
          scope: `storage:${bucketName}/${objectPath}`,
          message: downloadError?.message ?? "Empty download",
        });
        continue;
      }

      const bytes = Buffer.from(await blob.arrayBuffer());
      const target = path.join(outputRoot, "storage", bucketName, ...objectPath.split("/"));
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
      manifest.storage.objects += 1;
      manifest.storage.bytes += bytes.length;
    }

    if (!data || data.length < PAGE_SIZE) break;
  }
}

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) {
  manifest.errors.push({ scope: "storage.buckets", message: bucketError.message });
} else {
  manifest.storage.buckets = buckets.length;
  for (const bucket of buckets) {
    await backupStorageFolder(bucket.name);
  }
}

const manifestPath = path.join(outputRoot, "manifest.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
const checksum = createHash("sha256").update(await readFile(manifestPath)).digest("hex");
await writeFile(path.join(outputRoot, "manifest.sha256"), `${checksum}  manifest.json\n`, "utf8");

if (manifest.errors.length > 0) {
  throw new Error(`Backup finished with ${manifest.errors.length} error(s). Review ${manifestPath}.`);
}

process.stdout.write(
  `Backup complete: ${tableNames.length} tables, ${manifest.authUsers} auth users, ${manifest.storage.objects} storage objects.\n`
);
