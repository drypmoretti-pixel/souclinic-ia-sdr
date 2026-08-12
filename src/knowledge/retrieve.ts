import { supabase } from "../db/supabase.js";
import { embed } from "./embeddings.js";

export interface RetrievedChunk {
  title: string;
  content: string;
  similarity: number;
}

export async function retrieveRelevantKnowledge(query: string, matchCount = 4): Promise<RetrievedChunk[]> {
  const [queryEmbedding] = await embed([query]);

  const { data, error } = await supabase.rpc("match_clinic_documents", {
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });
  if (error) throw error;

  return data as RetrievedChunk[];
}
