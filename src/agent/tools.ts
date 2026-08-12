import { checkAvailability } from "../calendar/availability.js";
import { bookAppointment, rescheduleAppointment, cancelAppointment } from "../calendar/booking.js";
import { supabase } from "../db/supabase.js";

export interface ToolContext {
  leadId: string;
  leadNome: string;
  leadTelefone: string;
}

// Formato de tool da OpenAI (Chat Completions "function calling") —
// { type: "function", function: { name, description, parameters } }.
export interface OpenAIToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, unknown>;
      required: string[];
    };
  };
}

export const toolDefinitions: OpenAIToolDef[] = [
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Verifica os horários disponíveis para avaliação odontológica nos próximos 14 dias, respeitando o horário de atendimento da clínica. Use antes de oferecer um horário ao lead.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Reserva uma avaliação odontológica para o lead atual no horário informado. Só chame depois de confirmar com check_availability que o horário está livre e o lead confirmou verbalmente o horário.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Data no formato YYYY-MM-DD" },
          time: { type: "string", description: "Horário no formato HH:MM (24h)" },
        },
        required: ["date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description: "Remarca a avaliação já agendada do lead atual para uma nova data/horário.",
      parameters: {
        type: "object",
        properties: {
          date: { type: "string", description: "Nova data no formato YYYY-MM-DD" },
          time: { type: "string", description: "Novo horário no formato HH:MM (24h)" },
        },
        required: ["date", "time"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description: "Cancela a avaliação já agendada do lead atual.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Sinaliza que esse lead precisa de atendimento humano (ex: pergunta clínica sensível, pedido de valor sem avaliação, reclamação). Use em vez de tentar responder algo fora do que você pode informar.",
      parameters: {
        type: "object",
        properties: {
          motivo: { type: "string", description: "Por que esse lead precisa de um humano" },
        },
        required: ["motivo"],
      },
    },
  },
];

async function getActiveAppointment(leadId: string) {
  const { data, error } = await supabase
    .from("appointments")
    .select("*")
    .eq("lead_id", leadId)
    .in("status", ["agendado", "remarcado"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function executeTool(
  name: string,
  input: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  switch (name) {
    case "check_availability": {
      const availability = await checkAvailability();
      const dias = Object.entries(availability).slice(0, 7);
      if (dias.length === 0) return "Não há horários disponíveis nos próximos 14 dias.";
      return dias
        .map(([data, horarios]) => `${data}: ${horarios.slice(0, 6).join(", ")}${horarios.length > 6 ? "..." : ""}`)
        .join("\n");
    }

    case "book_appointment": {
      const { date, time } = input as { date: string; time: string };
      await bookAppointment({
        leadId: ctx.leadId,
        leadNome: ctx.leadNome,
        leadTelefone: ctx.leadTelefone,
        date,
        time,
      });
      return `Avaliação agendada com sucesso para ${date} às ${time}.`;
    }

    case "reschedule_appointment": {
      const { date, time } = input as { date: string; time: string };
      const appointment = await getActiveAppointment(ctx.leadId);
      if (!appointment || !appointment.google_event_id) {
        return "Não encontrei nenhuma avaliação agendada pra esse lead pra remarcar.";
      }
      await rescheduleAppointment({
        appointmentId: appointment.id,
        googleEventId: appointment.google_event_id,
        date,
        time,
      });
      return `Avaliação remarcada com sucesso para ${date} às ${time}.`;
    }

    case "cancel_appointment": {
      const appointment = await getActiveAppointment(ctx.leadId);
      if (!appointment || !appointment.google_event_id) {
        return "Não encontrei nenhuma avaliação agendada pra esse lead pra cancelar.";
      }
      await cancelAppointment({ appointmentId: appointment.id, googleEventId: appointment.google_event_id });
      return "Avaliação cancelada com sucesso.";
    }

    case "escalate_to_human": {
      const { motivo } = input as { motivo: string };
      await supabase.from("leads").update({ status_lead: "precisa_humano" }).eq("id", ctx.leadId);
      return `Sinalizado para atendimento humano. Motivo: ${motivo}`;
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
