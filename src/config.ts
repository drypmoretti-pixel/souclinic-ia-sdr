import "dotenv/config";

// Fuso fixo em Brasília. Todo o módulo src/calendar/ raciocina em horário local
// (getHours, new Date("...T09:00:00"), toISOString().slice(0,10)); num servidor em
// UTC — que é o padrão da VPS — isso agendaria a avaliação 3h errada e viraria o dia
// às 21h. Como config.ts é importado antes de qualquer lógica de data, setar aqui
// resolve para todo o processo. Pode ser sobrescrito pelo ambiente se precisar.
export const TIMEZONE = "America/Sao_Paulo";
process.env.TZ ??= TIMEZONE;

// Se o ambiente forçar outro fuso (ex.: TZ=UTC no pm2/systemd), respeitamos a
// escolha explícita mas avisamos alto — nesse caso os horários saem errados.
{
  const efetivo = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (efetivo !== TIMEZONE) {
    console.warn(
      `[ATENÇÃO] Fuso do processo é "${efetivo}", esperado "${TIMEZONE}". ` +
        `Agendamentos vão sair com horário errado. Remova TZ do ambiente ou defina TZ=${TIMEZONE}.`,
    );
  }
}

function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  supabase: {
    url: required("SUPABASE_URL", process.env.SUPABASE_URL),
    serviceRoleKey: required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  },
  openai: {
    // Um provedor só (chat + embeddings) — decisão do Igor de usar OpenAI em vez de Claude.
    apiKey: process.env.OPENAI_API_KEY ?? "",
  },
  google: {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL ?? "",
    privateKey: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "",
  },
  evolution: {
    apiUrl: process.env.EVOLUTION_API_URL ?? "",
    apiKey: process.env.EVOLUTION_API_KEY ?? "",
    instance: process.env.EVOLUTION_INSTANCE ?? "",
    /**
     * Trava de teste: se tiver número aqui, a IA só responde a esses; qualquer
     * outro é ignorado em silêncio. Vazio = atende todo mundo (produção).
     * Vários números separados por vírgula.
     */
    allowedNumbers: (process.env.ALLOWED_NUMBERS ?? "")
      .split(",")
      .map((n) => n.replace(/\D/g, ""))
      .filter(Boolean),
  },
  humanizacao: {
    /**
     * O tempo de "digitação" é proporcional ao tamanho do balão, como numa
     * pessoa de verdade: pergunta simples é respondida rápido, resposta longa
     * demora. Antes era ~30s fixo pra tudo, e 30s pra responder "oi" ficava
     * artificial. 0 em msPorChar desliga a humanização inteira.
     */
    msPorChar: Number(process.env.RESPOSTA_MS_POR_CHAR ?? 90),
    /** Tempo mínimo por balão — ler a mensagem e começar a responder. */
    pisoMs: Number(process.env.RESPOSTA_PISO_MS ?? 3_000),
    /** Teto por balão, pra texto longo não virar espera eterna. */
    tetoMs: Number(process.env.RESPOSTA_TETO_MS ?? 35_000),
    /**
     * Teto do tempo TOTAL da resposta, somando todos os balões e pausas. Rede de
     * segurança: se o modelo escapar e escrever demais, a resposta é comprimida
     * em vez de deixar o paciente 50s esperando.
     */
    tetoTotalMs: Number(process.env.RESPOSTA_TETO_TOTAL_MS ?? 40_000),
    /** Respiro depois de enviar um balão, antes de começar a digitar o próximo. */
    pausaEntreBaloesMs: Number(process.env.RESPOSTA_PAUSA_BALOES_MS ?? 2_500),
    /** Variação aleatória aplicada aos tempos (0.25 = ±25%), pra não soar cronometrado. */
    variacao: Number(process.env.RESPOSTA_DELAY_VARIACAO ?? 0.25),
    /**
     * Janela de espera por mais mensagens antes de responder. Gente manda "oi",
     * depois "queria marcar" — sem isso, cada uma vira uma resposta separada e
     * a IA fala sozinha em paralelo.
     */
    janelaAgrupamentoMs: Number(process.env.AGRUPAMENTO_MS ?? 8_000),
  },
  handoff: {
    /**
     * WhatsApp da secretária que assume as conversas escaladas. Sem isso o
     * handoff ainda trava a IA e registra, mas ninguém é avisado — a secretária
     * só descobre pelo painel.
     */
    secretariaWhatsapp: (process.env.SECRETARIA_WHATSAPP ?? "").replace(/\D/g, ""),
  },
  followup: {
    ativo: (process.env.FOLLOWUP_ATIVO ?? "true") !== "false",
    /** Silêncio necessário antes de cutucar. Padrão 2h, definido pelo Igor. */
    aposMs: Number(process.env.FOLLOWUP_APOS_MS ?? 2 * 60 * 60 * 1000),
    /** De quanto em quanto tempo a varredura roda. */
    intervaloMs: Number(process.env.FOLLOWUP_INTERVALO_MS ?? 10 * 60 * 1000),
    /** Tentativas por conversa. Uma só, de propósito — duas já é insistência. */
    maximo: Number(process.env.FOLLOWUP_MAXIMO ?? 1),
    /** Janela permitida, em hora de Brasília. Fora dela ninguém é incomodado. */
    horaInicio: Number(process.env.FOLLOWUP_HORA_INICIO ?? 9),
    horaFim: Number(process.env.FOLLOWUP_HORA_FIM ?? 19),
  },
  datacrazy: {
    /**
     * URL do webhook de "Entrada de Negócios" do CRM. A etapa de destino
     * (Agendamentos → Agendado) e a tag IA-SDR são configuradas no painel do
     * DataCrazy, não aqui. Vazio desliga a integração e o resto segue normal.
     *
     * Trate como senha: o webhook não pede autenticação — quem tiver a URL cria
     * negócio no CRM. O identificador no fim dela é o único segredo.
     */
    webhookUrl: process.env.DATACRAZY_WEBHOOK_URL ?? "",
  },
  admin: {
    // Senha compartilhada do dashboard admin (Igor + cliente). Simples de propósito —
    // mesmo padrão dos outros painéis internos do Igor (financas_casal, painel_comercial).
    token: process.env.ADMIN_TOKEN ?? "",
  },
};
