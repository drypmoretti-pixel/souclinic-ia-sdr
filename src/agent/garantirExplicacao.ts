import { supabase } from "../db/supabase.js";

// Garantia determinística de que a explicação da avaliação sai antes da oferta
// de horário.
//
// Foi a reclamação nº 1 do cliente e resistiu a três tentativas de instrução:
// regra no prompt, exceção explícita à regra de brevidade, reordenação das
// seções, resumo final, e por fim a instrução dentro do retorno da ferramenta.
// A suíte reprovou todas.
//
// A conclusão é simples: comportamento que o negócio exige não pode depender de
// o modelo obedecer. Aqui a resposta é inspecionada antes de sair — se ela
// oferece horário sem que a explicação tenha sido dada, a explicação é
// acrescentada. Não há caminho em que o paciente receba a oferta sem entender o
// que vai acontecer na avaliação.

/** Texto definido pelo cliente. */
export const EXPLICACAO_AVALIACAO =
  "Para isso, você precisa passar por uma avaliação completa aqui em nossa clínica, onde nossa " +
  "equipe de dentistas examina sua situação, faz uma análise completa e elabora o plano de tratamento.\n\n" +
  "E essa avaliação, diagnóstico e plano de tratamento não tem custo, fora que a gente fica muito bem " +
  "localizado, sendo de fácil acesso (em frente a estação de metrô de Águas Claras).";

/**
 * Marcador de que a explicação já saiu. "cirurgião/cirurgiã" e "não tem custo"
 * só aparecem nela; "raio-x" fica do texto anterior, para conversas em andamento
 * quando a mudança subiu.
 */
const MARCADOR =
  /equipe de dentistas|nossos dentistas|n[ãa]o t[êe]m? custo|sem custo|cirurgi|raio-?\s?x/i;

/**
 * A resposta está OFERECENDO um horário — não apenas citando horas.
 *
 * As duas condições juntas importam: "atendemos das 9h às 19h" tem hora e não é
 * oferta nenhuma, e prefixar a explicação da avaliação ali deixaria a resposta
 * sem sentido.
 */
const HORA_CONCRETA = /\b\d{1,2}\s?(:\d{2}|h\d{0,2})\b/;
const CONVITE = [
  /consigo (um )?(encaixe|hor[áa]rio)/i,
  /posso (agendar|reservar|marcar|confirmar|te colocar)/i,
  /qual (desses )?(hor[áa]rio|fica melhor|prefere)/i,
  /que tal/i,
  /te(nho|mos) (agenda|hor[áa]rio|dispon[íi]vel|livre)/i,
  /agenda dispon[íi]vel/i,
  /hor[áa]rios? dispon[íi]ve/i,
  /quando fica(ria)? (bom|melhor)/i,
  /fica melhor (pra|para) voc[êe]/i,
];

function ofereceHorario(texto: string): boolean {
  return HORA_CONCRETA.test(texto) && CONVITE.some((p) => p.test(texto));
}

async function jaExplicou(conversationId: string): Promise<boolean> {
  const { data } = await supabase
    .from("messages")
    .select("content")
    .eq("conversation_id", conversationId)
    .eq("direction", "out")
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []).some((m) => MARCADOR.test(m.content));
}

/**
 * Devolve a resposta pronta para envio, com a explicação na frente quando ela
 * for necessária e estiver faltando.
 *
 * O parágrafo separado vira uma mensagem própria no WhatsApp (ver
 * messaging/humanizado.ts), então o paciente recebe a explicação e a oferta
 * como duas mensagens, que é exatamente o formato pedido pelo cliente.
 */
export async function garantirExplicacao(
  conversationId: string,
  resposta: string,
): Promise<string> {
  if (!ofereceHorario(resposta)) return resposta;
  if (MARCADOR.test(resposta)) return resposta;
  if (await jaExplicou(conversationId)) return resposta;

  console.log("[fluxo] resposta oferecia horário sem a explicação — explicação inserida antes");
  return `${EXPLICACAO_AVALIACAO}\n\n${resposta}`;
}
