import { readFileSync } from "fs";
import { resolve } from "path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(path) {
  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key]) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value.trim();
  }
}

loadEnvFile(resolve(process.cwd(), ".env.local"));

const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const AUTHOR_NAME = "NeuroTrader AI Member";

const defaultCategory = {
  slug: "trading-journal",
  name: "Trading Journal",
  description: "Short, practical notes about journaling, psychology, and trading process.",
  sort_order: 10,
  is_locked: false,
};

const threads = [
  {
    title: "El journal revela el patron que tu memoria esconde",
    body: `La memoria del trader es selectiva. Recuerda el trade perfecto, exagera el error doloroso y olvida las pequenas decisiones que realmente movieron el resultado.

Un journal bien llevado te muestra tres cosas que la memoria no puede sostener sola:

- que setups repites cuando estas claro
- que errores aparecen cuando estas cansado
- que reglas rompes justo antes de perder control

El beneficio no es tener mas datos. El beneficio es dejar de adivinar quien eres bajo presion.`,
    tags: ["journal", "psychology", "process"],
    is_pinned: true,
    view_count: 18,
  },
  {
    title: "Tu edge empieza despues del cierre",
    body: `Muchos traders creen que el trabajo termina cuando cierran la posicion. Para mi, ahi empieza la parte que mas paga.

Despues del cierre puedes mirar el trade sin ruido:

- si la entrada estaba alineada con tu plan
- si el exit fue tecnico o emocional
- si el tamano de posicion tenia sentido
- si repetiste un patron que ya conocias

El journal convierte cada trade en entrenamiento. Sin review, el mercado te cobra la clase y tu no tomas notas.`,
    tags: ["review", "edge", "execution"],
    is_pinned: true,
    view_count: 15,
  },
  {
    title: "No escribas para llenar campos, escribe para mejorar decisiones",
    body: `Un journal no debe sentirse como tarea escolar. Si solo llenas campos por cumplir, no cambia tu trading.

La pregunta clave es simple: que informacion me ayudara a tomar una mejor decision la proxima vez?

Yo priorizaria:

- contexto del mercado
- razon de entrada
- invalidacion clara
- emocion antes y durante el trade
- si segui o no el plan

Cuando el journal esta conectado a decisiones reales, deja de ser documentacion y se vuelve sistema operativo.`,
    tags: ["discipline", "decision-making", "journal"],
    is_pinned: false,
    view_count: 11,
  },
  {
    title: "El journal baja la presion emocional",
    body: `La presion sube cuando todo vive en la cabeza. Un trade abierto, una perdida reciente, una meta diaria, una regla que casi rompiste: todo compite por atencion.

Escribir lo que esta pasando crea distancia. No elimina la emocion, pero la vuelve observable.

Ese espacio es importante porque el trader no necesita sentirse perfecto. Necesita poder pausar, mirar el plan y actuar con menos impulso.

Un buen journal no te hace frio. Te hace mas consciente.`,
    tags: ["mindset", "emotions", "risk"],
    is_pinned: false,
    view_count: 9,
  },
  {
    title: "De trader reactivo a operador con proceso",
    body: `La diferencia entre reaccionar y operar con proceso no siempre se ve en un solo trade. Se ve en la repeticion.

Cuando llevas journal, puedes construir evidencia:

- que haces bien cuando ganas
- que haces mal antes de perder
- que condiciones no deberias tradear
- que reglas merecen ser mas estrictas

Ese es el punto: el journal te ayuda a dejar de negociar contigo mismo. Cada review te recuerda el tipo de operador que estas tratando de construir.`,
    tags: ["process", "rules", "consistency"],
    is_pinned: false,
    view_count: 12,
  },
];

async function getOrCreateCategory() {
  const { data: existing, error: selectError } = await supabase
    .from("forum_categories")
    .select("id, slug")
    .eq("slug", defaultCategory.slug)
    .maybeSingle();

  if (selectError) throw selectError;
  if (existing?.id) return existing.id;

  const { data, error } = await supabase
    .from("forum_categories")
    .insert(defaultCategory)
    .select("id")
    .single();

  if (error) throw error;
  return data.id;
}

async function main() {
  const categoryId = await getOrCreateCategory();
  const created = [];
  const skipped = [];

  for (const thread of threads) {
    const { data: existing, error: existingError } = await supabase
      .from("forum_threads")
      .select("id")
      .eq("title", thread.title)
      .maybeSingle();

    if (existingError) throw existingError;
    if (existing?.id) {
      skipped.push(thread.title);
      continue;
    }

    const now = new Date().toISOString();
    const { error } = await supabase.from("forum_threads").insert({
      category_id: categoryId,
      user_id: null,
      author_name: AUTHOR_NAME,
      title: thread.title,
      body: thread.body,
      tags: thread.tags,
      is_pinned: thread.is_pinned,
      is_locked: false,
      reply_count: 0,
      view_count: thread.view_count,
      last_post_at: now,
      last_post_user_id: null,
    });

    if (error) throw error;
    created.push(thread.title);
  }

  console.log(JSON.stringify({ ok: true, created, skipped }, null, 2));
}

main().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
