import type { AICompletionResult } from "../types";
import { generateGoogleAiStudioChat } from "./google-ai-studio";
import { generateOpenAICompatibleChat, type OpenAICompatibleChatOptions } from "./openai-compatible";

export async function generateConfiguredChat(
  options: OpenAICompatibleChatOptions,
  fetchImpl: typeof fetch = globalThis.fetch
): Promise<AICompletionResult> {
  if (options.service === "gemini") {
    return generateGoogleAiStudioChat(options, fetchImpl);
  }

  return generateOpenAICompatibleChat(options, fetchImpl);
}
