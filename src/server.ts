import Fastify from "fastify";
import { config } from "./config.js";
import { ensureLeadConversation } from "./db/leads.js";
import { runAgentTurn } from "./agent/agent.js";
import { LocalProvider } from "./messaging/LocalProvider.js";
import { EvolutionApiProvider } from "./messaging/EvolutionApiProvider.js";
import { adminRoutes } from "./admin/routes.js";

const app = Fastify({ logger: true });
await app.register(adminRoutes);

const messaging = config.evolution.apiUrl ? new EvolutionApiProvider() : new LocalProvider();

/**
 * Compara dois telefones ignorando diferença de formato — código do país e o
 * nono dígito, que o WhatsApp às vezes inclui e às vezes não em número
 * brasileiro. Os últimos 8 dígitos são a parte estável.
 */
function mesmoNumero(a: string, b: string): boolean {
  const digitos = (s: string) => s.replace(/\D/g, "");
  return digitos(a).slice(-8) === digitos(b).slice(-8);
}

/** Trava de teste — ver ALLOWED_NUMBERS no config. Lista vazia = atende todos. */
function podeResponder(telefone: string): boolean {
  const permitidos = config.evolution.allowedNumbers;
  return permitidos.length === 0 || permitidos.some((n) => mesmoNumero(n, telefone));
}

if (config.evolution.allowedNumbers.length > 0) {
  app.log.warn(
    `MODO TESTE: a IA só responde a ${config.evolution.allowedNumbers.join(", ")}. ` +
      `Qualquer outro número é ignorado. Esvazie ALLOWED_NUMBERS pra atender todo mundo.`,
  );
}

// Endpoint de teste local — simula uma mensagem chegando, sem depender do WhatsApp.
// Body: { telefone: string, nome?: string, texto: string }
app.post("/dev/chat", async (request, reply) => {
  const { telefone, nome, texto } = request.body as { telefone: string; nome?: string; texto: string };
  const lead = await ensureLeadConversation(telefone, nome);
  const reply_ = await runAgentTurn(
    { leadId: lead.leadId, leadNome: lead.leadNome, leadTelefone: lead.leadTelefone, conversationId: lead.conversationId },
    texto,
  );
  return reply.send({ reply: reply_ });
});

// Webhook da Evolution API (MESSAGES_UPSERT) — plugar quando a instância existir.
// Formato: ver reference_evolution_api na memória do Igor / doc da Evolution API.
app.post("/webhook/whatsapp", async (request, reply) => {
  const body = request.body as any;
  const message = body?.data;
  const telefone: string | undefined = message?.key?.remoteJid?.split("@")[0];
  const texto: string | undefined = message?.message?.conversation ?? message?.message?.extendedTextMessage?.text;

  if (!telefone || !texto || message?.key?.fromMe) {
    return reply.send({ ok: true });
  }

  if (!podeResponder(telefone)) {
    app.log.info(`ignorado: ${telefone} não está em ALLOWED_NUMBERS (modo teste)`);
    return reply.send({ ok: true, ignored: "numero_nao_liberado" });
  }

  const lead = await ensureLeadConversation(telefone, message?.pushName);
  const respostaTexto = await runAgentTurn(
    { leadId: lead.leadId, leadNome: lead.leadNome, leadTelefone: lead.leadTelefone, conversationId: lead.conversationId },
    texto,
  );
  await messaging.sendText(telefone, respostaTexto);

  return reply.send({ ok: true });
});

app.get("/health", async () => ({ ok: true }));

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => app.log.info(`SouClinic IA SDR rodando na porta ${config.port}`))
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
