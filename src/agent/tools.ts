import { TIMEZONE } from "../config.js";
import { checkAvailability } from "../calendar/availability.js";

import { bookAppointment, rescheduleAppointment, cancelAppointment } from "../calendar/booking.js";
import { supabase } from "../db/supabase.js";
import { passarParaHumano } from "../handoff/handoff.js";
import type { MessagingProvider } from "../messaging/MessagingProvider.js";

/**
 * Formata os dias para o agente. O dia da semana vai explícito: com só a data
 * ISO o modelo errava a conversão ("quinta" virou a segunda-feira de hoje) e
 * afirmava o dia errado pro lead. Os horários vêm separados por período porque
 * o pedido mais comum é "de manhã" / "à tarde".
 */
function formatarDias(dias: [string, string[]][]): string {
  return dias
    .map(([data, horarios]) => {
      const [ano, mes, dia] = data.split("-").map(Number);
      const semana = new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        timeZone: TIMEZONE,
      }).format(new Date(ano, mes - 1, dia));
      const manha = horarios.filter((h) => h < "12:00");
      const tarde = horarios.filter((h) => h >= "12:00");
      const parte = (label: string, hs: string[]) =>
        hs.length ? `${label}: ${hs.slice(0, 5).join(", ")}${hs.length > 5 ? "..." : ""}` : "";
      const partes = [parte("manhã", manha), parte("tarde", tarde)].filter(Boolean).join(" | ");
      return `${data} (${semana}) -> ${partes}`;
    })
    .join("\n");
}

export interface ToolContext {
  leadId: string;
  leadNome: string;
  leadTelefone: string;
  conversationId: string;
  /** Necessário pro handoff avisar a secretária. */
  messaging: MessagingProvider;
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
        "Consulta horários livres para avaliação. Use UMA vez, antes de oferecer horário ao lead. " +
        "Se o lead citou um dia ('quinta', 'amanhã', 'dia 25'), passe esse dia em `data` para ver " +
        "só ele — sem isso você recebe vários dias e corre o risco de oferecer o dia errado. " +
        "NÃO chame de novo depois que o lead escolher um horário: nesse momento use book_appointment.",
      parameters: {
        type: "object",
        properties: {
          data: {
            type: "string",
            description:
              "Opcional. Dia específico no formato YYYY-MM-DD, quando o lead já indicou um dia.",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "RESERVA DE VERDADE a avaliação no horário informado. É esta ferramenta que efetiva o " +
        "agendamento — sem chamá-la, NADA é marcado, por mais que a conversa pareça concluída. " +
        "Chame IMEDIATAMENTE assim que o lead concordar com um horário ('sim', 'pode', 'isso', " +
        "'fechado', 'pode marcar', repetir o horário). NÃO chame check_availability de novo antes: " +
        "você já tem a disponibilidade, e reconsultar faz você perder o horário combinado. " +
        "NUNCA pergunte 'posso confirmar?' duas vezes — se o lead já disse sim, reserve.",
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
        "Passa a conversa para a secretária humana. A partir daí VOCÊ PARA de responder esse " +
        "paciente — use quando realmente não conseguir resolver, não como saída fácil. " +
        "Use quando: você já tentou duas vezes e o paciente continua sem ser atendido; a pergunta " +
        "exige informação que não está na sua base; é reclamação, urgência ou dor forte; ou o " +
        "paciente pede para falar com uma pessoa. Ao chamar, avise o paciente na mesma resposta " +
        "que alguém da equipe vai continuar o atendimento.",
      parameters: {
        type: "object",
        properties: {
          motivo: {
            type: "string",
            description:
              "Por que precisa de humano, em uma frase — a secretária lê isso pra saber como entrar na conversa",
          },
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
      const pedida = (input as { data?: string }).data;

      // Filtrar pelo dia pedido evita o erro que aparecia em conversa real: com a
      // lista de 7 dias na frente, o modelo oferecia sábado a quem pediu quinta.
      let dias = Object.entries(availability);
      if (pedida) {
        const doDia = dias.filter(([data]) => data === pedida);
        if (doDia.length > 0) {
          dias = doDia;
        } else {
          const proximos = dias.filter(([data]) => data > pedida).slice(0, 2);
          return (
            `Não há horário livre em ${pedida}. Ofereça uma alternativa e deixe claro que é outro dia.\n` +
            (proximos.length ? formatarDias(proximos) : "Sem horários nos próximos dias.")
          );
        }
      } else {
        dias = dias.slice(0, 7);
      }

      if (dias.length === 0) return "Não há horários disponíveis nos próximos 14 dias.";
      return formatarDias(dias);
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
      await passarParaHumano(ctx.messaging, {
        leadId: ctx.leadId,
        conversationId: ctx.conversationId,
        leadNome: ctx.leadNome,
        leadTelefone: ctx.leadTelefone,
        motivo,
      });
      return (
        "Conversa passada para a secretária humana, que já foi avisada. " +
        "Escreva UMA mensagem curta se despedindo e avisando que alguém da equipe vai continuar. " +
        "Depois dessa mensagem você não responde mais esse paciente."
      );
    }

    default:
      throw new Error(`Tool desconhecida: ${name}`);
  }
}
