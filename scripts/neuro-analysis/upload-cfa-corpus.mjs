import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import OpenAI from "openai";

const DEFAULT_CFA_DIR =
  "/Users/SGPAX/Library/CloudStorage/OneDrive-SharedLibraries-SGPAXCorp/SJ Otero Capital - Learning Hub/CFA/Curriculum";

function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnvLocal();

const corpusDir = process.env.NEURO_ANALYSIS_CFA_PDF_DIR || DEFAULT_CFA_DIR;
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
  console.error("Missing OPENAI_API_KEY.");
  process.exit(1);
}

if (!fs.existsSync(corpusDir)) {
  console.error(`CFA directory not found: ${corpusDir}`);
  process.exit(1);
}

const pdfPaths = fs
  .readdirSync(corpusDir)
  .filter((name) => /^LevelI_Vol.*\.pdf$/i.test(name))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  .map((name) => path.join(corpusDir, name));

if (pdfPaths.length === 0) {
  console.error(`No LevelI_Vol*.pdf files found in ${corpusDir}`);
  process.exit(1);
}

const totalBytes = pdfPaths.reduce((sum, filePath) => sum + fs.statSync(filePath).size, 0);
const client = new OpenAI({ apiKey });

console.log(`Found ${pdfPaths.length} CFA PDFs (${(totalBytes / 1024 / 1024).toFixed(1)} MB).`);
console.log("Creating Neuro Analysis CFA vector store...");

const vectorStore = await client.vectorStores.create({
  name: `Neuro Analysis CFA Level I Corpus ${new Date().toISOString().slice(0, 10)}`,
  metadata: {
    product: "neuro_analysis",
    corpus: "cfa_level_i",
    source: "private_user_uploaded_curriculum",
  },
});

console.log(`Vector store: ${vectorStore.id}`);
console.log("Uploading PDFs. This can take a few minutes...");

const fileIds = [];
for (const filePath of pdfPaths) {
  const fileName = path.basename(filePath);
  process.stdout.write(`Uploading ${fileName}... `);
  const file = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: "assistants",
  });
  fileIds.push(file.id);
  console.log(file.id);
}

console.log("Attaching uploaded files to the vector store and polling indexing status...");
const batch = await client.vectorStores.fileBatches.createAndPoll(
  vectorStore.id,
  { file_ids: fileIds },
  { pollIntervalMs: 5000 }
);

console.log(`Batch status: ${batch.status}`);
console.log(`Files total: ${batch.file_counts.total}`);
console.log(`Files completed: ${batch.file_counts.completed}`);
console.log(`Files failed: ${batch.file_counts.failed}`);

if (batch.file_counts.failed > 0) {
  console.error("One or more files failed to index. Check the OpenAI dashboard/vector store file status.");
  process.exit(1);
}

console.log("");
console.log("Add this to .env.local:");
console.log(`NEURO_ANALYSIS_CFA_VECTOR_STORE_ID=${vectorStore.id}`);
