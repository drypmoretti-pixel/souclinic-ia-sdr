import { config, TIMEZONE } from "../config.js";
import { supabase } from "../db/supabase.js";
import type { MessagingProvider } from "../messaging/MessagingProvider.js";

// Passagem de bastão para a secretária humana.
//
// Antes disso, escalate_to_human só marcava o lead no banco: ninguém era
// avisado e a IA continuava respondendo por cima. Na prática, escalar não
// fazia nada — um lead ficou marcado "precisa_humano" e ninguém soube.
//
// Agora o handoff faz as quatro coisas que ele precisa fazer:
//   1. trava a IA naquela conversa (ela não responde mais);
//   2. avisa a secretária no WhatsApp, com o contexto pronto;
//   3. o paciente é avisado pela própria IA, na mesma mensagem;
//   4. fica registrado quem, quando e por quê.

/** Últimas mensagens, pra secretária entrar na conversa sabendo o que rolou. */
async function resumoDaConversa(conversationId: string, limite = 6): Promise<string> {
  const { data } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limite);

  return (data ?? [])
    .reverse()
    .map((m) => `${m.direction === "in" ? "Paciente" : "IA"}: ${m.content.replace(/\n/g, " ")}`)
    .join("\n");
}

export interface DadosHandoff {
  leadId: string;
  conversationId: string;
  leadNome: string;
  leadTelefone: string;
  motivo: string;
}

/**
 * Executa a passagem. Não lança: se a notificação falhar, o importante — travar
 * a IA e registrar — já aconteceu, e é melhor a secretária descobrir pelo painel
 * do que o paciente receber resposta automática de novo.
 */
export async function passarParaHumano(
  messaging: MessagingProvider,
  dados: DadosHandoff,
): Promise<void> {
  const { conversationId, leadId, leadNome, leadTelefone, motivo } = dados;

  // 1. Trava a IA nessa conversa. É o passo que não pode falhar — por isso vem
  // primeiro e é o único que propaga erro.
  const { error } = await supabase
    .from("conversations")
    .update({ status: "com_humano", handoff_at: new Date().toISOString(), handoff_motivo: motivo })
    .eq("id", conversationId);
  if (error) throw error;

  await supabase.from("leads").update({ status_lead: "precisa_humano" }).eq("id", leadId);

  console.log(`[handoff] ${leadNome || leadTelefone} passou para humano — ${motivo}`);

  // 2. Avisa a secretária.
  const numero = config.handoff.secretariaWhatsapp;
  if (!numero) {
    console.warn("[handoff] SECRETARIA_WHATSAPP não configurado — ninguém foi avisado");
    return;
  }

  try {
    const agora = new Intl.DateTimeFormat("pt-BR", {
      timeZone: TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date());

    const resumo = await resumoDaConversa(conversationId);
    const texto =
      `🔔 *Atendimento precisa de você* (${agora})\n\n` +
      `*Paciente:* ${leadNome || "sem nome"}\n` +
      `*WhatsApp:* wa.me/${leadTelefone.replace(/\D/g, "")}\n` +
      `*Motivo:* ${motivo}\n\n` +
      `*Últimas mensagens:*\n${resumo}\n\n` +
      `_A IA parou de responder essa conversa. Fale direto com o paciente pelo link acima._`;

    await messaging.sendText(numero, texto);
  } catch (err) {
    console.error(`[handoff] falhei em avisar a secretária: ${(err as Error).message}`);
  }
}

/** A IA responde essa conversa, ou ela está nas mãos de um humano? */
export async function conversaEstaComHumano(conversationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("conversations")
    .select("status")
    .eq("id", conversationId)
    .single();
  return data?.status === "com_humano";
}
