import { supabase } from "./supabase.js";

export interface LeadConversation {
  leadId: string;
  leadNome: string;
  leadTelefone: string;
  conversationId: string;
}

// Garante lead + conversa ativa para um telefone, criando o que faltar.
// Idempotente o bastante pra ser chamado a cada mensagem recebida.
export async function ensureLeadConversation(telefone: string, nome?: string): Promise<LeadConversation> {
  let { data: lead, error } = await supabase.from("leads").select("*").eq("telefone", telefone).maybeSingle();
  if (error) throw error;

  if (!lead) {
    const { data: created, error: createError } = await supabase
      .from("leads")
      .insert({ telefone, nome: nome ?? null, origem: "whatsapp" })
      .select()
      .single();
    if (createError) throw createError;
    lead = created;
  } else if (nome && !lead.nome) {
    await supabase.from("leads").update({ nome }).eq("id", lead.id);
    lead.nome = nome;
  }

  const { data: conversation, error: convError } = await supabase
    .from("conversations")
    .select("*")
    .eq("lead_id", lead.id)
    .eq("status", "ativa")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (convError) throw convError;

  let conversationId = conversation?.id;
  if (!conversationId) {
    const { data: created, error: createConvError } = await supabase
      .from("conversations")
      .insert({ lead_id: lead.id, canal: "whatsapp", status: "ativa" })
      .select()
      .single();
    if (createConvError) throw createConvError;
    conversationId = created.id;
  }

  return {
    leadId: lead.id,
    leadNome: lead.nome ?? "sem nome",
    leadTelefone: lead.telefone,
    conversationId,
  };
}
