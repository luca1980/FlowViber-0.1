import { createClient } from "@supabase/supabase-js"
import type { ConversationState } from "@/lib/prompting-system"

interface AIMessage {
  role: "user" | "assistant" | "system"
  content: string
}

interface AIResponse {
  content: string
  provider: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
  conversationState?: ConversationState
  completeness?: number
  phase?: string
  canGenerateWorkflow?: boolean
  fallback?: boolean
  fallbackReason?: string
  fallbackProvider?: string
}

interface AIProvider {
  name: string
  apiKey: string
  available: boolean
}

class AIService {
  private supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)

  private providers: AIProvider[] = []
  private rateLimits = new Map<string, { count: number; resetTime: number }>()
  private initialized = false

  async initialize() {
    if (this.initialized) return

    console.log("[v0] Initializing AI service...")
    const { data: apiKeys, error } = await this.supabase.from("api_keys").select("provider, encrypted_key")

    if (error) {
      console.error("[v0] Error fetching API keys:", error)
      return
    }

    console.log(
      "[v0] Found API keys:",
      apiKeys?.map((k) => k.provider),
    )

    if (apiKeys) {
      this.providers = apiKeys.map((key) => {
        const normalizedProvider = this.normalizeProviderName(key.provider)
        console.log("[v0] Normalized provider:", key.provider, "->", normalizedProvider)

        return {
          name: normalizedProvider,
          apiKey: key.encrypted_key,
          available: true,
        }
      })
    }

    console.log(
      "[v0] Available providers:",
      this.providers.map((p) => p.name),
    )
    this.initialized = true
  }

  private normalizeProviderName(provider: string): string {
    const normalized = provider.toLowerCase().trim()
    if (normalized.includes("claude")) return "claude"
    if (normalized.includes("openai")) return "openai"
    return normalized
  }

  async generateResponse(messages: AIMessage[], conversationState?: ConversationState | null): Promise<AIResponse> {
    console.log("[v0] Sending messages to AI service:", messages.length)
    if (conversationState) {
      console.log(
        "[v0] Conversation state - Phase:",
        conversationState.phase,
        "Completeness:",
        conversationState.completeness,
      )
    }

    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          conversationState,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        const errorCode = error.errorCode || "UNKNOWN"
        const details = error.details || "No additional details"

        console.error("[v0] AI service error:", {
          code: errorCode,
          message: error.error,
          details: details,
        })

        let userMessage = error.error || "AI service request failed"

        switch (errorCode) {
          case "CONTEXT_LENGTH_EXCEEDED":
            userMessage = "⚠️ Conversation is too long. The AI will now use a shorter context window to continue."
            break
          case "CREDITS_LOW":
            userMessage = "💳 AI provider credits are low. Switching to backup provider..."
            break
          case "RATE_LIMIT":
            userMessage = "⏱️ Rate limit reached. Switching to backup provider..."
            break
          case "ALL_PROVIDERS_FAILED":
            userMessage = "❌ All AI providers are currently unavailable. Please try again in a few minutes."
            break
          case "NO_API_KEYS":
            userMessage = "🔑 No AI API keys configured. Please add them in Advanced Settings."
            break
        }

        throw new Error(userMessage)
      }

      const data = await response.json()
      console.log("[v0] AI service response received from:", data.provider)

      if (data.fallback) {
        console.log("[v0] Used fallback provider:", data.fallbackProvider, "due to:", data.fallbackReason)
      }

      if (data.conversationState) {
        console.log("[v0] Updated conversation state - Phase:", data.phase, "Completeness:", data.completeness + "%")
      }

      return data
    } catch (error) {
      console.error("[v0] AI service error:", error)
      throw error
    }
  }

  getAvailableProviders(): string[] {
    return ["claude", "openai"] // Static list since we check availability server-side
  }
}

export const aiService = new AIService()
