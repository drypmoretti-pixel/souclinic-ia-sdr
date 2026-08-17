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
  },
  admin: {
    // Senha compartilhada do dashboard admin (Igor + cliente). Simples de propósito —
    // mesmo padrão dos outros painéis internos do Igor (financas_casal, painel_comercial).
    token: process.env.ADMIN_TOKEN ?? "",
  },
};
