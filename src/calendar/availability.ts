import { getCalendarClient, CALENDAR_ID } from "./googleCalendar.js";

// Horário de atendimento da SouClinic (seg-sex 9h-19h, sáb 9h-17h, dom fechado).
// weekday: 0 = domingo ... 6 = sábado
const HORARIOS_ATENDIMENTO: Record<number, [string, string][]> = {
  0: [],
  1: [["09:00", "19:00"]],
  2: [["09:00", "19:00"]],
  3: [["09:00", "19:00"]],
  4: [["09:00", "19:00"]],
  5: [["09:00", "19:00"]],
  6: [["09:00", "17:00"]],
};

const SLOT_MINUTES = 60;
const STEP_MINUTES = 15;
const DAYS_AHEAD = 14;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface AvailabilityByDay {
  [date: string]: string[]; // "2026-08-12": ["09:00", "09:15", ...]
}

export async function checkAvailability(): Promise<AvailabilityByDay> {
  const calendar = getCalendarClient();
  const calendarId = CALENDAR_ID();

  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + DAYS_AHEAD);

  const freebusy = await calendar.freebusy.query({
    requestBody: {
      timeMin: start.toISOString(),
      timeMax: end.toISOString(),
      items: [{ id: calendarId }],
    },
  });

  const busy = freebusy.data.calendars?.[calendarId]?.busy ?? [];

  const busyByDay = new Map<string, [number, number][]>();
  for (const b of busy) {
    if (!b.start || !b.end) continue;
    const bStart = new Date(b.start);
    const bEnd = new Date(b.end);
    const key = dateKey(bStart);
    const arr = busyByDay.get(key) ?? [];
    arr.push([bStart.getHours() * 60 + bStart.getMinutes(), bEnd.getHours() * 60 + bEnd.getMinutes()]);
    busyByDay.set(key, arr);
  }

  const result: AvailabilityByDay = {};

  for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
    const dCopy = new Date(d);
    if (dCopy <= now && dateKey(dCopy) === dateKey(now)) {
      // ainda permite o dia de hoje, mas filtra horários já passados mais abaixo
    }
    const weekday = dCopy.getDay();
    const janelas = HORARIOS_ATENDIMENTO[weekday] ?? [];
    if (janelas.length === 0) continue;

    const key = dateKey(dCopy);
    const busySlots = busyByDay.get(key) ?? [];

    const disponiveis: string[] = [];
    for (const [inicioStr, fimStr] of janelas) {
      let blocos: [number, number][] = [[toMinutes(inicioStr), toMinutes(fimStr)]];

      for (const [oIni, oFim] of busySlots) {
        const novosBlocos: [number, number][] = [];
        for (const [bIni, bFim] of blocos) {
          if (oFim <= bIni || oIni >= bFim) {
            novosBlocos.push([bIni, bFim]);
          } else {
            if (oIni > bIni) novosBlocos.push([bIni, oIni]);
            if (oFim < bFim) novosBlocos.push([oFim, bFim]);
          }
        }
        blocos = novosBlocos;
      }

      for (const [bIni, bFim] of blocos) {
        for (let i = bIni; i + SLOT_MINUTES <= bFim; i += STEP_MINUTES) {
          const isToday = key === dateKey(now);
          const nowMinutes = now.getHours() * 60 + now.getMinutes();
          if (isToday && i <= nowMinutes) continue;
          disponiveis.push(toHHMM(i));
        }
      }
    }

    if (disponiveis.length > 0) result[key] = disponiveis;
  }

  return result;
}
