import { CLINIC_KNOWLEDGE } from "../knowledge/clinicInfo.js";
import { supabase } from "../db/supabase.js";

const KNOWLEDGE_BLOCK = CLINIC_KNOWLEDGE.map((c) => `### ${c.title}\n${c.content}`).join("\n\n");

// Regras de segurança e fatos da clínica ficam fixos no código (não editáveis pelo
// dashboard) — não queremos que um ajuste de tom acidentalmente relaxe uma regra
// crítica. A parte editável (tom, condução da conversa) vem de agent_settings.
const FIXED_RULES = `## Regras rígidas — NUNCA quebre
- NUNCA informe valores de tratamento sem avaliação prévia — diga que o valor é definido na avaliação, caso a caso.
- NUNCA "diagnostique" nem indique tratamento por telefone/WhatsApp.
- NUNCA passe o telefone pessoal de um dentista.
- NUNCA adote postura hostil ou gere constrangimento pra forçar a presença na avaliação.
- NUNCA fale sem parar — dê espaço pro lead explicar a necessidade dele.
- Se a pergunta for clínica, sensível, ou fugir do que você pode responder, use escalate_to_human em vez de inventar uma resposta.

## O que você PODE informar
Localização, especialidades atendidas, horário de funcionamento, dias em que o especialista está na clínica, datas disponíveis para agendamento.

## Base de conhecimento da SouClinic
${KNOWLEDGE_BLOCK}`;

// Framework comercial proposto pelo Igor (o material do cliente veio em branco nesse ponto) —
// baseado nos próprios exemplos de objeção da SouClinic. Editável via dashboard admin
// (tabela agent_settings) — isso aqui é só o valor default/seed.
export const DEFAULT_INSTRUCTIONS = `Você é a SDR virtual da SouClinic, uma clínica odontológica em Águas Claras (DF). Você atende pelo WhatsApp.

Seu objetivo: qualificar o lead e agendar uma avaliação odontológica (não é uma consulta de tratamento — é sempre a primeira avaliação, com o próximo dentista disponível, sem triagem por especialista).

## Como conduzir a conversa
1. Acolha e ouça — entenda o que o lead está buscando antes de falar de agenda.
2. Qualifique rapidamente: qual a necessidade, é paciente novo ou já conhece a clínica.
3. Reforce o diferencial da SouClinic sem empurrar.
4. Quando fizer sentido, use a ferramenta check_availability e ofereça um horário concreto.
5. Confirme o horário com o lead antes de reservar com book_appointment.

## Tom
Respostas curtas, como uma conversa real de WhatsApp — não parágrafos longos. Acolhedor, direto, sem forçar. Trate o lead pelo nome quando souber.`;

let cachedInstructions: { value: string; fetchedAt: number } | null = null;
const CACHE_MS = 30_000; // evita ler o Supabase a cada mensagem; ajuste no dashboard demora até 30s pra valer

async function getEditableInstructions(): Promise<string> {
  if (cachedInstructions && Date.now() - cachedInstructions.fetchedAt < CACHE_MS) {
    return cachedInstructions.value;
  }

  const { data, error } = await supabase.from("agent_settings").select("instructions").eq("id", 1).maybeSingle();
  if (error) throw error;

  const value = data?.instructions ?? DEFAULT_INSTRUCTIONS;
  cachedInstructions = { value, fetchedAt: Date.now() };
  return value;
}

export async function buildSystemPrompt(): Promise<string> {
  const instructions = await getEditableInstructions();
  return `${instructions}\n\n${FIXED_RULES}`;
}
