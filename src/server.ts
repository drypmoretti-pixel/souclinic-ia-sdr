import Fastify from "fastify";
import { config } from "./config.js";
import { ensureLeadConversation } from "./db/leads.js";
import { runAgentTurn } from "./agent/agent.js";
import { LocalProvider } from "./messaging/LocalProvider.js";
import { EvolutionApiProvider } from "./messaging/EvolutionApiProvider.js";
import { enviarHumanizado } from "./messaging/humanizado.js";
import { receberMensagem } from "./messaging/filaConversa.js";
import { extrairConteudo } from "./messaging/midia.js";
import { iniciarFollowUps } from "./followup/followup.js";
import { conversaEstaComHumano } from "./handoff/handoff.js";
import { registrarMensagemRecebida } from "./db/leads.js";
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
  if (!telefone || message?.key?.fromMe) {
    return reply.send({ ok: true });
  }

  // A notificação de handoff sai pelo número da IA, então a secretária pode
  // responder ali por reflexo. Sem isso ela viraria "lead", a IA responderia, e
  // no futuro sem allowlist ela apareceria no funil como paciente.
  if (config.handoff.secretariaWhatsapp && mesmoNumero(config.handoff.secretariaWhatsapp, telefone)) {
    app.log.info("mensagem da secretária no número da IA — ignorada (ela fala com o paciente direto)");
    return reply.send({ ok: true, ignored: "secretaria" });
  }

  if (!podeResponder(telefone)) {
    app.log.info(`ignorado: ${telefone} não está em ALLOWED_NUMBERS (modo teste)`);
    return reply.send({ ok: true, ignored: "numero_nao_liberado" });
  }

  // Áudio vira transcrição e imagem vira descrição antes de o agente ver — daqui
  // pra frente o sistema inteiro trabalha só com texto. Roda antes da fila
  // porque a transcrição leva alguns segundos e não pode segurar o webhook.
  const conteudo = await extrairConteudo(message);
  if (!conteudo) {
    app.log.info(`sem conteúdo aproveitável de ${telefone} (figurinha, mídia não suportada ou falha)`);
    return reply.send({ ok: true, ignored: "sem_conteudo" });
  }
  const texto = conteudo.texto;
  if (conteudo.origem !== "texto") {
    app.log.info(`${telefone} enviou ${conteudo.origem} -> "${texto.slice(0, 80)}"`);
  }

  // Responde o webhook na hora e processa depois: com o delay humanizado a
  // resposta leva ~30s, e segurar a conexão faria a Evolution estourar o
  // timeout e reenviar a mensagem (o paciente receberia tudo duplicado).
  receberMensagem(telefone, texto, message?.pushName, async (tel, textoAgrupado, nome) => {
    const lead = await ensureLeadConversation(tel, nome);

    // Conversa já passada para a secretária: a mensagem fica registrada (ela
    // precisa ver o histórico completo no painel), mas a IA não responde. Duas
    // vozes atendendo o mesmo paciente é pior do que demorar pra responder.
    if (await conversaEstaComHumano(lead.conversationId)) {
      await registrarMensagemRecebida(lead.conversationId, textoAgrupado);
      app.log.info(`${tel} está com atendimento humano — IA não respondeu`);
      return;
    }

    const respostaTexto = await runAgentTurn(
      { leadId: lead.leadId, leadNome: lead.leadNome, leadTelefone: lead.leadTelefone, conversationId: lead.conversationId },
      textoAgrupado,
      messaging,
    );
    await enviarHumanizado(messaging, tel, respostaTexto);
  });

  return reply.send({ ok: true });
});

app.get("/health", async () => ({ ok: true }));

app
  .listen({ port: config.port, host: "0.0.0.0" })
  .then(() => {
    app.log.info(`SouClinic IA SDR rodando na porta ${config.port}`);
    iniciarFollowUps(messaging);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
