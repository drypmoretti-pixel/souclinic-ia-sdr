import { getCalendarClient, CALENDAR_ID } from "./googleCalendar.js";
import { supabase } from "../db/supabase.js";

const CLINIC_ADDRESS =
  "Avenida Pau Brasil, Lote 06, Loja 02, Edifício E-Business, Águas Claras, DF — CEP 71916-500 (ao lado da Estação de Metrô Águas Claras)";

const SLOT_MINUTES = 60;

interface BookParams {
  leadId: string;
  leadNome: string;
  leadTelefone: string;
  date: string; // "2026-08-12"
  time: string; // "09:00"
}

export async function bookAppointment({ leadId, leadNome, leadTelefone, date, time }: BookParams) {
  const calendar = getCalendarClient();
  const calendarId = CALENDAR_ID();

  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);

  const event = await calendar.events.insert({
    calendarId,
    requestBody: {
      summary: `Avaliação odontológica — ${leadNome}`,
      description: `Avaliação odontológica — SouClinic\nPaciente: ${leadNome}\nTelefone: ${leadTelefone}\nEndereço: ${CLINIC_ADDRESS}`,
      location: CLINIC_ADDRESS,
      start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    },
  });

  const { data: appointment, error } = await supabase
    .from("appointments")
    .insert({
      lead_id: leadId,
      google_event_id: event.data.id,
      data_hora: start.toISOString(),
      status: "agendado",
    })
    .select()
    .single();
  if (error) throw error;

  await supabase.from("leads").update({ status_lead: "agendado" }).eq("id", leadId);

  return { appointment, googleEventId: event.data.id, start, end };
}

export async function rescheduleAppointment({
  appointmentId,
  googleEventId,
  date,
  time,
}: {
  appointmentId: string;
  googleEventId: string;
  date: string;
  time: string;
}) {
  const calendar = getCalendarClient();
  const calendarId = CALENDAR_ID();

  const start = new Date(`${date}T${time}:00`);
  const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);

  await calendar.events.patch({
    calendarId,
    eventId: googleEventId,
    requestBody: {
      start: { dateTime: start.toISOString(), timeZone: "America/Sao_Paulo" },
      end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    },
  });

  const { error } = await supabase
    .from("appointments")
    .update({ data_hora: start.toISOString(), status: "remarcado" })
    .eq("id", appointmentId);
  if (error) throw error;

  return { start, end };
}

export async function cancelAppointment({
  appointmentId,
  googleEventId,
}: {
  appointmentId: string;
  googleEventId: string;
}) {
  const calendar = getCalendarClient();
  const calendarId = CALENDAR_ID();

  await calendar.events.delete({ calendarId, eventId: googleEventId });

  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelado" })
    .eq("id", appointmentId);
  if (error) throw error;
}
