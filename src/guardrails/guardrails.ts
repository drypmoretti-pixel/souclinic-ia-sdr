import { config } from "../config.js";
import { supabase } from "../db/supabase.js";

// Guarda-corpo: detecta quando a IA está enroscada e passa a conversa para a
// secretária antes que o paciente desista.
//
// Nasceu de um caso real: a IA pediu confirmação de horário, o paciente disse
// "Sim", e ela respondeu oferecendo outro dia — quatro vezes seguidas, sem nunca
// agendar. Ninguém percebeu até alguém ler a conversa inteira depois. Com esse
// guarda-corpo, na segunda repetição a secretária já teria entrado.
//
// Os sinais são objetivos de propósito. Não se pergunta ao modelo "você está
// indo bem?" — modelo perdido costuma achar que está indo bem.

/** Texto comparável: sem acento, sem pontuação, sem caixa, sem espaço duplo. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Semelhança entre duas frases pela proporção de palavras em comum (Jaccard).
 * Simples de propósito: o que se quer pegar é a IA repetindo a mesma ideia com
 * pequenas variações, e não paráfrase distante.
 */
export function semelhanca(a: string, b: string): number {
  const pa = new Set(normalizar(a).split(" ").filter((p) => p.length > 3));
  const pb = new Set(normalizar(b).split(" ").filter((p) => p.length > 3));
  if (pa.size === 0 || pb.size === 0) return 0;

  let comuns = 0;
  for (const p of pa) if (pb.has(p)) comuns++;
  return comuns / new Set([...pa, ...pb]).size;
}

/**
 * Frases com que a IA oferece horário ou pede confirmação de agendamento.
 *
 * Existe porque comparar palavras não funcionou: no caso real que originou este
 * módulo, "Posso reservar esse horário pra você?" e "Que tal às 10:00 da manhã?"
 * têm quase nenhuma palavra em comum, mas são a MESMA tentativa repetida. O que
 * se repete é a intenção, não o texto — então é a intenção que se detecta.
 */
const PADROES_FECHAMENTO = [
  /posso (reservar|confirmar|agendar|marcar)/i,
  /quer que eu (agende|reserve|marque|veja)/i,
  /que tal (às|as|no dia)/i,
  /temos? (um )?hor[áa]rio/i,
  /hor[áa]rios? dispon[íi]ve/i,
  /posso (te )?colocar/i,
];

function ehTentativaDeFechamento(texto: string): boolean {
  return PADROES_FECHAMENTO.some((p) => p.test(texto));
}

export interface Veredito {
  escalar: boolean;
  motivo: string;
}

const OK: Veredito = { escalar: false, motivo: "" };

/**
 * Avalia se a conversa deve sair do automático, olhando a resposta que a IA
 * acabou de gerar contra o que ela já disse.
 *
 * Roda depois de gerar e antes de enviar — só assim dá pra comparar a resposta
 * nova com as anteriores.
 */
export async function avaliarConversa(
  conversationId: string,
  respostaProposta: string,
  leadJaAgendou: boolean,
): Promise<Veredito> {
  if (!config.guardrails.ativo) return OK;
  // Quem já agendou pode conversar à vontade: o objetivo foi cumprido.
  if (leadJaAgendou) return OK;

  const { data, error } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) return OK; // guarda-corpo com defeito não pode derrubar atendimento

  const mensagens = data ?? [];
  const daIA = mensagens.filter((m) => m.direction === "out").map((m) => m.content);

  // 1. Travou no fechamento: ofereceu horário / pediu confirmação várias vezes
  // e o agendamento não saiu. É o sinal mais valioso — o lead está com a mão na
  // maçaneta e não consegue entrar.
  if (ehTentativaDeFechamento(respostaProposta)) {
    const tentativas =
      1 + daIA.slice(0, config.guardrails.janelaFechamento).filter(ehTentativaDeFechamento).length;
    if (tentativas >= config.guardrails.tentativasFechamento) {
      return {
        escalar: true,
        motivo: `a IA ofereceu horário ${tentativas}x e o agendamento não saiu — travou no fechamento`,
      };
    }
  }

  // 2. Repetição literal: a resposta nova é quase igual a algo que ela acabou de
  // dizer. Pega o caso mais óbvio, quando ela repete quase palavra por palavra.
  const recentes = daIA.slice(0, config.guardrails.janelaRepeticao);
  const parecidas = recentes.filter(
    (m) => semelhanca(m, respostaProposta) >= config.guardrails.limiteSemelhanca,
  ).length;
  if (parecidas >= config.guardrails.repeticoesParaEscalar) {
    return {
      escalar: true,
      motivo: "a IA repetiu a mesma resposta várias vezes sem resolver — provável travamento",
    };
  }

  // 2. Conversa arrastando sem chegar a lugar nenhum.
  if (mensagens.length >= config.guardrails.maxMensagensSemAgendar) {
    return {
      escalar: true,
      motivo: `conversa longa (${mensagens.length} mensagens) sem agendamento`,
    };
  }

  return OK;
}

/** O que o paciente ouve quando o guarda-corpo dispara. */
export function mensagemDeTransicao(): string {
  return (
    "Deixa eu chamar alguém da equipe pra te ajudar melhor com isso 😊\n\n" +
    "Já já te respondem por aqui."
  );
}
