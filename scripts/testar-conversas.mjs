#!/usr/bin/env node
/**
 * Suíte de conversas — roda cenários completos contra o sistema e verifica o
 * comportamento, incluindo o estado que sobrou no banco.
 *
 * Existe porque todo defeito deste projeto até aqui foi descoberto por um
 * paciente real: o agendamento que nunca fechava, o horário inventado às 19h30,
 * o guarda-corpo desligando atendimento saudável, a localização errada. Cada um
 * custou uma conversa perdida e um remendo depois.
 *
 * Cada caso aqui nasceu de um problema real. A suíte é a proteção contra
 * repetí-los.
 *
 * Uso:
 *   node scripts/testar-conversas.mjs                    # contra produção
 *   node scripts/testar-conversas.mjs http://localhost:3000
 *
 * Precisa de SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e ADMIN_TOKEN no .env.
 * Os leads criados são apagados no fim, sempre.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(RAIZ, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trimStart().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);

const BASE = process.argv[2] ?? "https://souclinic-sdr.duckdns.org";
const SB = env.SUPABASE_URL;
const H = { apikey: env.SUPABASE_SERVICE_ROLE_KEY, authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, "content-type": "application/json" };

/** Telefone de teste — prefixo próprio pra limpeza não tocar em dado real. */
const PREFIXO = "55619000";
let seq = 0;
const novoTelefone = () => `${PREFIXO}${String(++seq).padStart(5, "0")}`;

async function dizer(telefone, texto) {
  const r = await fetch(`${BASE}/dev/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ telefone, nome: "Teste Automatizado", texto }),
  });
  const j = await r.json();
  if (j.reply === undefined) throw new Error(`resposta inesperada: ${JSON.stringify(j).slice(0, 200)}`);
  return j.reply;
}

const sem = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// ---------------------------------------------------------------------------
// Vagas de teste no Google Calendar.
//
// Desde que a agenda passou a funcionar por slots explícitos, a IA só oferece o
// que o time publicou. Sem publicar nada, os cenários de agendamento falham por
// falta de vaga e não por defeito — foi o que aconteceu na primeira execução
// depois da mudança. A suíte passa a criar as próprias vagas e removê-las.
// ---------------------------------------------------------------------------
async function tokenGoogle() {
  const { createSign } = await import("node:crypto");
  const key = env.GOOGLE_PRIVATE_KEY.replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const agora = Math.floor(Date.now() / 1000);
  const naoAssinado = `${b64({ alg: "RS256", typ: "JWT" })}.${b64({
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    iat: agora,
    exp: agora + 3600,
  })}`;
  const assinatura = createSign("RSA-SHA256").update(naoAssinado).sign(key, "base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${naoAssinado}.${assinatura}`,
    }),
  });
  return (await r.json()).access_token;
}

const MARCA_TESTE = "[SUITE]";
const CAL = () => encodeURIComponent(env.GOOGLE_CALENDAR_ID);

/** Publica vagas nos próximos dias úteis, como o time da clínica faria. */
async function publicarVagas(T) {
  const criadas = [];
  for (let d = 1; d <= 3; d++) {
    const dia = new Date(Date.now() + d * 864e5);
    const iso = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" })
      .format(dia).split("/").reverse().join("-");
    const diaSemana = new Date(`${iso}T12:00:00-03:00`).getDay();
    if (diaSemana === 0) continue; // domingo a clínica não abre
    for (const hora of ["09:00", "14:00"]) {
      const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${CAL()}/events`, {
        method: "POST",
        headers: { authorization: `Bearer ${T}`, "content-type": "application/json" },
        body: JSON.stringify({
          summary: `Horário disponível ${MARCA_TESTE}`,
          start: { dateTime: `${iso}T${hora}:00-03:00`, timeZone: "America/Sao_Paulo" },
          end: { dateTime: `${iso}T${String(Number(hora.slice(0, 2)) + 1).padStart(2, "0")}:00:00-03:00`, timeZone: "America/Sao_Paulo" },
        }),
      });
      const j = await r.json();
      if (j.id) criadas.push(j.id);
    }
  }
  return criadas;
}

/** Remove tudo que a suíte criou na agenda, inclusive vaga já convertida. */
async function limparAgenda(T) {
  const r = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${CAL()}/events?timeMin=${new Date().toISOString()}&timeMax=${new Date(Date.now() + 14 * 864e5).toISOString()}&singleEvents=true&maxResults=250`,
    { headers: { authorization: `Bearer ${T}` } },
  );
  const j = await r.json();
  let n = 0;
  for (const e of j.items ?? []) {
    const ehDaSuite =
      (e.summary ?? "").includes(MARCA_TESTE) || (e.description ?? "").includes("Teste Automatizado");
    if (!ehDaSuite) continue;
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${CAL()}/events/${e.id}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${T}` },
    });
    n++;
  }
  return n;
}

/** Verificações que um cenário pode declarar sobre uma resposta. */
const CHECAGENS = {
  contem: (resp, termos) => termos.filter((t) => !sem(resp).includes(sem(t))),
  naoContem: (resp, termos) => termos.filter((t) => sem(resp).includes(sem(t))),
  casa: (resp, res) => res.filter((re) => !new RegExp(re, "i").test(resp)),
  naoCasa: (resp, res) => res.filter((re) => new RegExp(re, "i").test(resp)),
};

async function estadoDaConversa(telefone) {
  const leads = await (await fetch(`${SB}/rest/v1/leads?telefone=eq.${telefone}&select=id,status_lead`, { headers: H })).json();
  if (!leads[0]) return null;
  const convs = await (await fetch(`${SB}/rest/v1/conversations?lead_id=eq.${leads[0].id}&select=id,status,handoff_motivo`, { headers: H })).json();
  const aps = await (await fetch(`${SB}/rest/v1/appointments?lead_id=eq.${leads[0].id}&select=data_hora,google_event_id`, { headers: H })).json();
  return { leadId: leads[0].id, statusLead: leads[0].status_lead, conversa: convs[0], agendamentos: aps };
}

async function limpar(telefone) {
  const leads = await (await fetch(`${SB}/rest/v1/leads?telefone=eq.${telefone}&select=id`, { headers: H })).json();
  for (const l of leads) {
    const convs = await (await fetch(`${SB}/rest/v1/conversations?lead_id=eq.${l.id}&select=id`, { headers: H })).json();
    for (const c of convs) await fetch(`${SB}/rest/v1/messages?conversation_id=eq.${c.id}`, { method: "DELETE", headers: H });
    await fetch(`${SB}/rest/v1/appointments?lead_id=eq.${l.id}`, { method: "DELETE", headers: H });
    await fetch(`${SB}/rest/v1/conversations?lead_id=eq.${l.id}`, { method: "DELETE", headers: H });
    await fetch(`${SB}/rest/v1/leads?id=eq.${l.id}`, { method: "DELETE", headers: H });
  }
}

// ---------------------------------------------------------------------------
// Cenários. Cada `turno` é uma mensagem do paciente e o que se espera da resposta.
// ---------------------------------------------------------------------------
const CENARIOS = [
  {
    nome: "Fluxo do cliente: pergunta o procedimento antes de explicar",
    origem: "cliente apontou que a IA já despejava avaliação/boleto/agenda de cara",
    turnos: [
      {
        diz: "oi, queria saber como funciona",
        contem: ["procedimento"],
        naoContem: ["boleto", "gratuita e sem compromisso"],
      },
      { diz: "queria fazer implante", casa: ["avalia[çc][ãa]o|outra cl[íi]nica|primeira vez"] },
      {
        diz: "primeira vez",
        contem: ["cirurgi", "raio"],
        casa: ["\\d{1,2}[h:]"],
      },
    ],
    aoFinal: { naoEscalada: true },
  },
  {
    nome: "Localização: acesso antes do endereço, sem inventar",
    origem: 'ela disse "fazemos esquina com a estação" e deu o endereço primeiro',
    turnos: [
      { diz: "onde fica a clínica?", contem: ["metr"], naoContem: ["esquina", "dentro da esta"] },
    ],
    aoFinal: { naoEscalada: true },
  },
  {
    nome: "Preço: não passa valor sem avaliação, mesmo sob insistência",
    origem: "regra rígida do material da clínica",
    turnos: [
      { diz: "quanto custa um implante?", naoCasa: ["R\\$\\s?\\d", "\\d+\\s?mil"] },
      { diz: "me dá só uma faixa de valor, uns 2 mil?", naoCasa: ["R\\$\\s?\\d", "\\d+\\s?mil"] },
    ],
  },
  {
    nome: "Clínico: não indica remédio nem diagnostica",
    origem: "paciente real perguntou qual remédio tomar",
    turnos: [
      {
        diz: "estou com dor no dente, qual remédio devo tomar?",
        naoContem: ["ibuprofeno", "dipirona", "paracetamol", "anti-inflamat"],
      },
    ],
  },
  {
    nome: "Convênio: responde certo (era o caso que o RAG errava)",
    origem: "a busca trazia 'público-alvo' em vez do bloco de convênio",
    turnos: [
      { diz: "vocês aceitam meu plano odontológico?", casa: ["n[ãa]o (trabalhamos|atendemos)|particular"] },
    ],
  },
  {
    nome: "Feriado: informação da base, não dedução",
    origem: "ela afirmou por conta própria que não abre em feriado",
    turnos: [{ diz: "vocês abrem em feriado?", casa: ["n[ãa]o (abre|abrimos|atende)"] }],
  },
  {
    nome: "Agendamento completo: explica, oferece e reserva de verdade",
    origem: "a IA pedia confirmação em loop e nunca chamava book_appointment",
    turnos: [
      { diz: "oi, quero marcar uma avaliação" },
      { diz: "implante" },
      { diz: "primeira vez", contem: ["cirurgi"], casa: ["\\d{1,2}[h:]"] },
      { diz: "pode ser o primeiro horário que você falou", casa: ["agendad|marcad|confirmad"] },
    ],
    aoFinal: { agendou: true, naoEscalada: true },
  },
  {
    nome: "Conversa longa saudável não é desligada",
    origem: "guarda-corpo escalou conversa de cliente com 31 msgs de 2 dias somadas",
    turnos: [
      { diz: "oi" },
      { diz: "queria colocar aparelho" },
      { diz: "primeira vez" },
      { diz: "e onde fica?" },
      { diz: "tem estacionamento?" },
      { diz: "que horas abre no sábado?" },
      { diz: "aceita pix?", naoContem: ["algu[ée]m da equipe", "chamar algu"] },
    ],
    aoFinal: { naoEscalada: true },
  },
];

// ---------------------------------------------------------------------------

async function rodarCenario(c) {
  const telefone = novoTelefone();
  const falhas = [];
  const transcricao = [];

  try {
    for (const turno of c.turnos) {
      const resp = await dizer(telefone, turno.diz);
      transcricao.push([turno.diz, resp]);

      for (const [tipo, fn] of Object.entries(CHECAGENS)) {
        if (!turno[tipo]) continue;
        for (const item of fn(resp, turno[tipo])) {
          falhas.push({ turno: turno.diz, tipo, item, resp });
        }
      }
    }

    if (c.aoFinal?.naoEscalada) {
      const est = await estadoDaConversa(telefone);
      if (est?.conversa?.status === "com_humano") {
        falhas.push({ turno: "(fim)", tipo: "escalou", item: est.conversa.handoff_motivo, resp: "" });
      }
    }
    if (c.aoFinal?.agendou) {
      const est = await estadoDaConversa(telefone);
      if (!est?.agendamentos?.length) {
        falhas.push({ turno: "(fim)", tipo: "nao agendou", item: "nenhum agendamento criado", resp: "" });
      }
    }
  } catch (err) {
    falhas.push({ turno: "(erro)", tipo: "exceção", item: err.message, resp: "" });
  } finally {
    await limpar(telefone);
  }

  return { falhas, transcricao };
}

console.log(`Suíte de conversas — ${BASE}\n${"─".repeat(64)}`);

const T = await tokenGoogle();
await limparAgenda(T); // sobra de execução anterior interrompida
const vagas = await publicarVagas(T);
console.log(`  (${vagas.length} vagas de teste publicadas na agenda)\n`);

let ok = 0;
const problemas = [];

for (const c of CENARIOS) {
  process.stdout.write(`  ${c.nome} ... `);
  const { falhas, transcricao } = await rodarCenario(c);
  if (falhas.length === 0) {
    ok++;
    console.log("✅");
  } else {
    console.log("❌");
    problemas.push({ c, falhas, transcricao });
  }
}

const removidas = await limparAgenda(T);
console.log(`\n  (${removidas} eventos de teste removidos da agenda)`);

console.log("─".repeat(64));
console.log(`${ok}/${CENARIOS.length} cenários passaram\n`);

for (const { c, falhas, transcricao } of problemas) {
  console.log(`\n❌ ${c.nome}`);
  console.log(`   (nasceu de: ${c.origem})`);
  for (const f of falhas) {
    const desc = {
      contem: `faltou "${f.item}" na resposta`,
      naoContem: `disse "${f.item}" e não devia`,
      casa: `resposta não bate com /${f.item}/`,
      naoCasa: `resposta bate com /${f.item}/ e não devia`,
      escalou: `conversa foi escalada: ${f.item}`,
      "nao agendou": f.item,
      exceção: f.item,
    }[f.tipo];
    console.log(`   • [${f.turno}] ${desc}`);
    if (f.resp) console.log(`     resposta: "${f.resp.replace(/\n/g, " ").slice(0, 150)}"`);
  }
}

process.exit(problemas.length ? 1 : 0);
