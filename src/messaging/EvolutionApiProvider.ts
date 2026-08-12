import { config } from "../config.js";
import type { MessagingProvider } from "./MessagingProvider.js";

// Plugar quando a instância Evolution API da SouClinic existir — ver SPEC-IA-SDR.md.
// Formato de envio confirmado em outras instâncias do Igor: POST /message/sendText/{instance}.
export class EvolutionApiProvider implements MessagingProvider {
  async sendText(telefone: string, text: string): Promise<void> {
    const { apiUrl, apiKey, instance } = config.evolution;
    if (!apiUrl || !apiKey || !instance) {
      throw new Error("Evolution API não configurada ainda (EVOLUTION_API_URL / EVOLUTION_API_KEY / EVOLUTION_INSTANCE).");
    }

    const numero = telefone.replace(/\D/g, "");
    const res = await fetch(`${apiUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: { apikey: apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ number: numero, text }),
    });

    if (!res.ok) {
      throw new Error(`Evolution API falhou ao enviar mensagem: ${res.status} ${await res.text()}`);
    }
  }
}
