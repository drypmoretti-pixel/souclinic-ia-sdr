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
