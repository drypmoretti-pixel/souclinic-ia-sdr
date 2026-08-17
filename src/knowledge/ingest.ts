import { supabase } from "../db/supabase.js";
import { embed } from "./embeddings.js";
import { CLINIC_KNOWLEDGE, textoParaEmbedding } from "./clinicInfo.js";

// Roda com `npm run ingest`. Reingesta tudo do zero (apaga e recria) —
// simples o bastante pro volume atual; revisitar se a base crescer muito.
async function main() {
  console.log(`Ingerindo ${CLINIC_KNOWLEDGE.length} chunks da base de conhecimento...`);

  const { error: deleteError } = await supabase.from("clinic_documents").delete().neq(
    "id",
    "00000000-0000-0000-0000-000000000000",
  );
  if (deleteError) throw deleteError;

  // Embarca título + perguntas equivalentes + conteúdo; o content gravado (e
  // devolvido ao agente) continua limpo, sem as perguntas.
  const embeddings = await embed(CLINIC_KNOWLEDGE.map(textoParaEmbedding));

  const rows = CLINIC_KNOWLEDGE.map((chunk, i) => ({
    title: chunk.title,
    content: chunk.content,
    embedding: embeddings[i],
  }));

  const { error } = await supabase.from("clinic_documents").insert(rows);
  if (error) throw error;

  console.log(`OK — ${rows.length} documentos inseridos em clinic_documents.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
