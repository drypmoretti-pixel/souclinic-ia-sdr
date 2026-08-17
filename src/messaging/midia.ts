import OpenAI from "openai";
import { config } from "../config.js";

// Paciente manda áudio. Muito. Numa clínica brasileira, ignorar áudio é ignorar
// boa parte dos leads — e o pior é que o silêncio parece descaso da clínica.
//
// Este módulo transforma áudio e imagem em texto antes de o agente ver a
// mensagem, de forma que o resto do sistema continua trabalhando só com texto.

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/** Baixa a mídia pela Evolution API e devolve base64 + mimetype. */
async function baixarMidia(messageId: string): Promise<{ base64: string; mimetype: string } | null> {
  const { apiUrl, apiKey, instance } = config.evolution;
  try {
    const res = await fetch(`${apiUrl}/chat/getBase64FromMediaMessage/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: { id: messageId } }, convertToMp4: false }),
    });
    if (!res.ok) {
      console.error(`[midia] download falhou: ${res.status} ${(await res.text()).slice(0, 200)}`);
      return null;
    }
    const j = (await res.json()) as { base64?: string; mimetype?: string };
    return j.base64 ? { base64: j.base64, mimetype: j.mimetype ?? "application/octet-stream" } : null;
  } catch (err) {
    console.error(`[midia] erro ao baixar: ${(err as Error).message}`);
    return null;
  }
}

/** Transcreve áudio com Whisper. Devolve null se não der. */
async function transcrever(base64: string, mimetype: string): Promise<string | null> {
  try {
    const ext = mimetype.includes("mp4") ? "mp4" : mimetype.includes("mpeg") ? "mp3" : "ogg";
    const arquivo = new File([Buffer.from(base64, "base64")], `audio.${ext}`, { type: mimetype });

    const r = await openai.audio.transcriptions.create({
      file: arquivo,
      model: "whisper-1",
      language: "pt",
    });
    const texto = r.text?.trim();
    return texto || null;
  } catch (err) {
    console.error(`[midia] transcrição falhou: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Descreve uma imagem em texto.
 *
 * Cuidado deliberado: paciente manda foto de dente esperando diagnóstico, e a
 * clínica não pode diagnosticar por WhatsApp — é regra do próprio material da
 * SouClinic e é risco profissional. Por isso a instrução pede uma descrição
 * neutra do que aparece, sem hipótese clínica, sem nome de doença e sem
 * sugestão de tratamento. Quem decide o que responder é o agente, com as regras
 * dele.
 */
async function descreverImagem(base64: string, mimetype: string, legenda?: string): Promise<string | null> {
  try {
    const r = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Descreva em uma frase curta e neutra o que aparece nesta imagem enviada por um paciente " +
                "a uma clínica odontológica. NÃO faça diagnóstico, NÃO cite nome de doença ou problema " +
                "dentário, NÃO sugira tratamento. Apenas descreva objetivamente o que é a imagem " +
                "(ex.: 'foto dos dentes da frente', 'print de um orçamento', 'documento pessoal').",
            },
            { type: "image_url", image_url: { url: `data:${mimetype};base64,${base64}` } },
          ],
        },
      ],
      max_tokens: 120,
    });
    const desc = r.choices[0]?.message?.content?.trim();
    if (!desc) return null;
    return legenda ? `${desc} Legenda do paciente: "${legenda}"` : desc;
  } catch (err) {
    console.error(`[midia] leitura de imagem falhou: ${(err as Error).message}`);
    return null;
  }
}

export interface ConteudoRecebido {
  /** Texto que o agente vai ler — digitado, transcrito ou descrito. */
  texto: string;
  /** Como chegou, pra registrar no log e no histórico. */
  origem: "texto" | "audio" | "imagem" | "documento";
}

/**
 * Extrai o conteúdo de uma mensagem da Evolution, seja ela do tipo que for.
 * Devolve null quando não há nada aproveitável (sticker, figurinha, etc.).
 */
export async function extrairConteudo(message: any): Promise<ConteudoRecebido | null> {
  const m = message?.message;
  if (!m) return null;

  const texto: string | undefined = m.conversation ?? m.extendedTextMessage?.text;
  if (texto?.trim()) return { texto: texto.trim(), origem: "texto" };

  const id: string | undefined = message?.key?.id;
  if (!id) return null;

  if (m.audioMessage) {
    const midia = await baixarMidia(id);
    if (!midia) return null;
    const transcricao = await transcrever(midia.base64, midia.mimetype);
    return transcricao ? { texto: transcricao, origem: "audio" } : null;
  }

  if (m.imageMessage) {
    const midia = await baixarMidia(id);
    if (!midia) return null;
    const desc = await descreverImagem(midia.base64, midia.mimetype, m.imageMessage.caption);
    // A legenda sozinha já vale como mensagem se a leitura da imagem falhar.
    if (desc) return { texto: `[o paciente enviou uma imagem] ${desc}`, origem: "imagem" };
    return m.imageMessage.caption?.trim()
      ? { texto: m.imageMessage.caption.trim(), origem: "imagem" }
      : null;
  }

  if (m.documentMessage || m.documentWithCaptionMessage) {
    // PDF e afins não são lidos: o volume não justifica, e um documento mal
    // interpretado numa clínica é pior do que documento não lido. O agente
    // recebe o aviso e responde pedindo o essencial por texto.
    const doc = m.documentMessage ?? m.documentWithCaptionMessage?.message?.documentMessage;
    const nome = doc?.fileName ?? "um arquivo";
    return {
      texto:
        `[o paciente enviou um documento: "${nome}", que você NÃO consegue abrir] ` +
        `Peça, com gentileza, que ele resuma em poucas palavras o que precisa, ou diga que pode ` +
        `trazer o documento na avaliação.`,
      origem: "documento",
    };
  }

  return null;
}
