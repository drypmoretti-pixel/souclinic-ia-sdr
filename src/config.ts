import "dotenv/config";

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
