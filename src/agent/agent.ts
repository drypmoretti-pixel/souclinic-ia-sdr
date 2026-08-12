import OpenAI from "openai";
import type { ChatCompletionMessageParam, ChatCompletionMessageToolCall } from "openai/resources/chat/completions";
import { config } from "../config.js";
import { supabase } from "../db/supabase.js";
import { buildSystemPrompt } from "./systemPrompt.js";
import { toolDefinitions, executeTool, type ToolContext } from "./tools.js";

const client = new OpenAI({ apiKey: config.openai.apiKey });

const MODEL = "gpt-4o";
const HISTORY_LIMIT = 20;

export interface AgentTurnContext {
  leadId: string;
  leadNome: string;
  leadTelefone: string;
  conversationId: string;
}

async function loadHistory(conversationId: string): Promise<ChatCompletionMessageParam[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("direction, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);
  if (error) throw error;

  return (data ?? []).map((m) => ({
    role: m.direction === "in" ? "user" : "assistant",
    content: m.content,
  }));
}

async function saveMessage(conversationId: string, direction: "in" | "out", content: string) {
  const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, direction, content });
  if (error) throw error;
}

export async function runAgentTurn(ctx: AgentTurnContext, userMessage: string): Promise<string> {
  await saveMessage(ctx.conversationId, "in", userMessage);

  const [history, systemPrompt] = await Promise.all([loadHistory(ctx.conversationId), buildSystemPrompt()]);
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userMessage },
  ];

  const toolCtx: ToolContext = { leadId: ctx.leadId, leadNome: ctx.leadNome, leadTelefone: ctx.leadTelefone };

  let response = await client.chat.completions.create({
    model: MODEL,
    messages,
    tools: toolDefinitions,
  });
  let choice = response.choices[0].message;

  while (choice.tool_calls && choice.tool_calls.length > 0) {
    messages.push({ role: "assistant", content: choice.content, tool_calls: choice.tool_calls });

    for (const toolCall of choice.tool_calls as ChatCompletionMessageToolCall[]) {
      let result: string;
      try {
        const input = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
        result = await executeTool(toolCall.function.name, input, toolCtx);
      } catch (err) {
        result = `Erro ao executar a ferramenta: ${(err as Error).message}`;
      }
      messages.push({ role: "tool", tool_call_id: toolCall.id, content: result });
    }

    response = await client.chat.completions.create({
      model: MODEL,
      messages,
      tools: toolDefinitions,
    });
    choice = response.choices[0].message;
  }

  const finalText = (choice.content ?? "").trim();

  await saveMessage(ctx.conversationId, "out", finalText);

  return finalText;
}
