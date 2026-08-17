import { supabase } from "../db/supabase.js";
import { embed } from "./embeddings.js";

export interface RetrievedChunk {
  title: string;
  content: string;
  similarity: number;
}

/**
 * Piso de similaridade pra um chunk ser considerado resposta.
 *
 * Calibrado em 2026-08-17 contra 19 perguntas reais de paciente: os acertos
 * legítimos ficaram entre 0.394 ("quanto custa uma lente de porcelana?") e 0.684
 * ("a primeira consulta é paga?"), enquanto pergunta claramente fora do escopo
 * ficou em 0.286.
 *
 * Escolhido conservador de propósito. Um falso positivo custa pouco — entra um
 * chunk irrelevante no contexto e o system prompt segura a resposta. Um falso
 * negativo custa caro — o agente responde sobre convênio ou preço sem a
 * informação certa. Na dúvida, deixa passar.
 */
export const SIMILARITY_THRESHOLD = 0.35;

export async function retrieveRelevantKnowledge(
  query: string,
  matchCount = 4,
  threshold = SIMILARITY_THRESHOLD,
): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embed([query]);

  const { data, error } = await supabase.rpc("match_clinic_documents", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
    match_threshold: threshold,
  });
  if (error) throw error;

  return data as RetrievedChunk[];
}
