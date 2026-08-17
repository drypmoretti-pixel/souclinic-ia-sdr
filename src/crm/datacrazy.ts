import { config } from "../config.js";

// Integração com o CRM DataCrazy. Escopo, definido pelo Igor: só o lead que
// FECHA agendamento vira negócio no CRM, direto na etapa "consulta agendada".
// Quem só conversou e não marcou não entra — não enche o funil de curioso.
//
// Docs: https://docs.datacrazy.io — API REST com Bearer token.

const BASE = "https://api.g1.datacrazy.io/api/v1";

interface Lead {
  id: string;
  name?: string;
  phone?: string;
  rawPhone?: string;
}

function headers() {
  return {
    Authorization: `Bearer ${config.datacrazy.token}`,
    "Content-Type": "application/json",
  };
}

/** Só os dígitos — é assim que o CRM guarda em `rawPhone`. */
function digitos(telefone: string): string {
  return telefone.replace(/\D/g, "");
}

/**
 * Formato que o DataCrazy usa no campo `phone`: "+55 (61) 999998888".
 * Aceita o telefone do WhatsApp (que vem como "5561999998888") e devolve
 * formatado; se não reconhecer o padrão brasileiro, manda como veio.
 */
function formatarTelefone(telefone: string): string {
  const d = digitos(telefone);
  const m = d.match(/^(\d{2})(\d{2})(\d{8,9})$/);
  return m ? `+${m[1]} (${m[2]}) ${m[3]}` : telefone;
}

async function buscarLeadPorTelefone(telefone: string): Promise<Lead | null> {
  const d = digitos(telefone);
  const res = await fetch(`${BASE}/leads?search=${encodeURIComponent(d)}&take=20`, {
    headers: headers(),
  });
  if (!res.ok) throw new Error(`busca de lead falhou: ${res.status} ${await res.text()}`);

  const { data } = (await res.json()) as { data?: Lead[] };
  // A busca é textual e pode devolver quase-acertos, então confirmo comparando
  // os últimos 8 dígitos — mesmo critério usado na allowlist do WhatsApp, pelo
  // mesmo motivo (nono dígito e DDI variam).
  return (data ?? []).find((l) => digitos(l.rawPhone ?? l.phone ?? "").slice(-8) === d.slice(-8)) ?? null;
}

async function criarLead(nome: string, telefone: string): Promise<string> {
  const res = await fetch(`${BASE}/leads`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: nome,
      phone: formatarTelefone(telefone),
      source: "IA SDR WhatsApp",
    }),
  });
  if (!res.ok) throw new Error(`criação de lead falhou: ${res.status} ${await res.text()}`);

  // A doc não garante corpo no 201; se não vier o id, busco o lead recém-criado.
  const corpo = await res.text();
  if (corpo) {
    const j = JSON.parse(corpo) as Partial<Lead>;
    if (j.id) return j.id;
  }
  const achado = await buscarLeadPorTelefone(telefone);
  if (!achado) throw new Error("lead criado mas não encontrado na busca seguinte");
  return achado.id;
}

/**
 * Chamado depois que a avaliação é reservada com sucesso. Cria o lead no CRM
 * se ele ainda não existir e abre o negócio na etapa de consulta agendada.
 *
 * NUNCA lança: se o CRM estiver fora do ar ou mal configurado, o agendamento
 * do paciente já aconteceu e está no Google Calendar — derrubar o atendimento
 * por causa do CRM seria bem pior do que ficar sem o registro. Falha vira log.
 */
export async function registrarConsultaAgendada(params: {
  nome: string;
  telefone: string;
  quando: Date;
}): Promise<void> {
  const { token, stageId } = config.datacrazy;
  if (!token || !stageId) return; // integração desligada

  try {
    const existente = await buscarLeadPorTelefone(params.telefone);
    const leadId = existente?.id ?? (await criarLead(params.nome, params.telefone));

    const res = await fetch(`${BASE}/businesses`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ leadId, stageId }),
    });
    if (!res.ok) throw new Error(`criação de negócio falhou: ${res.status} ${await res.text()}`);

    console.log(
      `[datacrazy] negócio criado — lead ${leadId} (${params.nome}), ` +
        `avaliação em ${params.quando.toISOString()}${existente ? "" : " [lead novo]"}`,
    );
  } catch (err) {
    console.error(`[datacrazy] não consegui registrar o agendamento: ${(err as Error).message}`);
  }
}
