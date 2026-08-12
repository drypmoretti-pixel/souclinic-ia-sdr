import type { FastifyInstance } from "fastify";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { supabase } from "../db/supabase.js";
import { config } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function adminRoutes(app: FastifyInstance) {
  // A página em si é pública (só um shell com campo de senha) — os dados
  // é que ficam atrás do header x-admin-token, checado abaixo.
  app.get("/admin", async (_request, reply) => {
    const html = await readFile(join(__dirname, "dashboard.html"), "utf-8");
    reply.type("text/html").send(html);
  });

  app.addHook("preHandler", async (request, reply) => {
    if (!request.url.startsWith("/admin/api")) return;
    const token = request.headers["x-admin-token"];
    if (!config.admin.token || token !== config.admin.token) {
      reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/admin/api/inbox", async (_request, reply) => {
    const { data, error } = await supabase.from("v_admin_inbox").select("*").limit(100);
    if (error) return reply.code(500).send({ error: error.message });
    reply.send({ conversations: data });
  });

  app.get("/admin/api/conversations/:conversationId/messages", async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };
    const { data, error } = await supabase
      .from("messages")
      .select("direction, content, created_at")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true });
    if (error) return reply.code(500).send({ error: error.message });
    reply.send({ messages: data });
  });

  app.get("/admin/api/metrics", async (_request, reply) => {
    const [{ data: leads, error: leadsError }, { data: appointments, error: apptError }, { count: messagesToday }] =
      await Promise.all([
        supabase.from("leads").select("status_lead, created_at"),
        supabase.from("appointments").select("status, data_hora"),
        supabase
          .from("messages")
          .select("id", { count: "exact", head: true })
          .gte("created_at", new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      ]);
    if (leadsError) return reply.code(500).send({ error: leadsError.message });
    if (apptError) return reply.code(500).send({ error: apptError.message });

    const leadsByStatus: Record<string, number> = {};
    for (const l of leads ?? []) {
      leadsByStatus[l.status_lead] = (leadsByStatus[l.status_lead] ?? 0) + 1;
    }

    const appointmentsByStatus: Record<string, number> = {};
    for (const a of appointments ?? []) {
      appointmentsByStatus[a.status] = (appointmentsByStatus[a.status] ?? 0) + 1;
    }

    reply.send({
      totalLeads: leads?.length ?? 0,
      leadsByStatus,
      totalAppointments: appointments?.length ?? 0,
      appointmentsByStatus,
      messagesToday: messagesToday ?? 0,
    });
  });
}
