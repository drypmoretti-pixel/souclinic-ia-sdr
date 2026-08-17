import { config } from "../config.js";
import type { MessagingProvider } from "./MessagingProvider.js";

// Faz a resposta parecer digitada por uma pessoa, e não cuspida por um bot:
// demora pra responder, mostra "digitando...", e manda em pedaços em vez de um
// blocão só. Pedido do Igor em 2026-08-17.

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** A presença do WhatsApp expira sozinha em poucos segundos, então é renovada. */
const FATIA_PRESENCA_MS = 8_000;

/** Acima disso o balão vira parede de texto no celular. */
const MAX_CHARS_POR_BALAO = 280;

/**
 * Quebra a resposta em balões, na ordem de preferência: parágrafos, depois
 * frases quando o parágrafo é longo demais. Frase nunca é cortada no meio.
 */
export function dividirEmBaloes(texto: string): string[] {
  const paragrafos = texto
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

  const baloes: string[] = [];
  for (const p of paragrafos) {
    if (p.length <= MAX_CHARS_POR_BALAO) {
      baloes.push(p);
      continue;
    }
    // Parágrafo longo: agrupa frases inteiras até encher o balão.
    const frases = p.match(/[^.!?]+[.!?]*\s*/g) ?? [p];
    let atual = "";
    for (const f of frases) {
      if (atual && (atual + f).length > MAX_CHARS_POR_BALAO) {
        baloes.push(atual.trim());
        atual = f;
      } else {
        atual += f;
      }
    }
    if (atual.trim()) baloes.push(atual.trim());
  }
  return baloes.length ? baloes : [texto.trim()];
}

/** Espera mostrando "digitando...", renovando a presença enquanto durar. */
async function digitandoPor(
  messaging: MessagingProvider,
  telefone: string,
  ms: number,
): Promise<void> {
  let restante = ms;
  while (restante > 0) {
    const fatia = Math.min(restante, FATIA_PRESENCA_MS);
    await messaging.sendPresence?.(telefone, fatia);
    await dormir(fatia);
    restante -= fatia;
  }
}

/**
 * Envia a resposta como uma pessoa mandaria.
 *
 * O tempo total gira em torno de `config.humanizacao.delayMedioMs` (com variação
 * aleatória pra não ficar cronometrado), distribuído entre os balões conforme o
 * tamanho de cada um — balão maior "leva mais tempo pra digitar".
 */
export async function enviarHumanizado(
  messaging: MessagingProvider,
  telefone: string,
  texto: string,
): Promise<void> {
  const baloes = dividirEmBaloes(texto);
  const { delayMedioMs, variacao } = config.humanizacao;

  if (delayMedioMs <= 0) {
    for (const b of baloes) await messaging.sendText(telefone, b);
    return;
  }

  // ex.: 30s com variação de 0.25 -> algo entre 22,5s e 37,5s
  const fator = 1 + (Math.random() * 2 - 1) * variacao;
  const total = delayMedioMs * fator;

  const chars = baloes.reduce((s, b) => s + b.length, 0) || 1;
  for (const balao of baloes) {
    await digitandoPor(messaging, telefone, Math.round(total * (balao.length / chars)));
    await messaging.sendText(telefone, balao);
  }
}
