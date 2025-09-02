import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { AdvancedPromptingSystem, type ConversationState } from "@/lib/prompting-system"

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
})

interface AIMessage {
  role: "user" | "assistant" | "system"
  content: string
}

const failedProviders = new Set<string>()
let sessionStartTime = Date.now()

// Reset failed providers every 30 minutes
const SESSION_RESET_INTERVAL = 30 * 60 * 1000

function resetSessionIfNeeded() {
  if (Date.now() - sessionStartTime > SESSION_RESET_INTERVAL) {
    failedProviders.clear()
    sessionStartTime = Date.now()
  }
}

async function callClaude(apiKey: string, messages: AIMessage[]) {
  console.log("[v0] Calling Claude with model: claude-sonnet-4-20250514")

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4000,
      messages: messages.filter((m) => m.role !== "system"),
      system: messages.find((m) => m.role === "system")?.content,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error("[v0] Claude API error details:", error)

    let errorDetails = { type: "unknown", message: error }
    try {
      const parsedError = JSON.parse(error)
      errorDetails = parsedError.error || parsedError
    } catch {
      // Keep original error if parsing fails
    }

    throw new Error(`Claude API error: ${response.status} - ${error}`, { cause: errorDetails })
  }

  const data = await response.json()
  console.log("[v0] Claude API success")
  return {
    content: data.content[0].text,
    provider: "claude",
    usage: data.usage,
  }
}

async function callOpenAI(apiKey: string, messages: AIMessage[]) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4",
      messages: messages,
      max_tokens: 4000,
      temperature: 0.7,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error("[v0] OpenAI API error details:", error)

    let errorDetails = { type: "unknown", message: error, code: "UNKNOWN" }
    try {
      const parsedError = JSON.parse(error)
      errorDetails = parsedError.error || parsedError
    } catch {
      // Keep original error if parsing fails
    }

    throw new Error(`OpenAI API error: ${response.status} - ${error}`, { cause: errorDetails })
  }

  const data = await response.json()
  console.log("[v0] OpenAI API success")
  return {
    content: data.choices[0].message.content,
    provider: "openai",
    usage: data.usage,
  }
}

export async function POST(request: NextRequest) {
  try {
    const { messages, conversationState, isWorkflowGeneration } = await request.json()

    resetSessionIfNeeded()

    const promptingSystem = AdvancedPromptingSystem.getInstance()

    if (isWorkflowGeneration) {
      console.log("[v0] Workflow generation requested - using JSON generation prompt")

      const workflowGenerationPrompt = `You are an expert n8n workflow generator. Your ONLY task is to generate valid n8n workflow JSON based on the conversation history.

CRITICAL INSTRUCTIONS:
- Generate ONLY valid n8n workflow JSON
- NO explanations, comments, or markdown formatting
- NO text before or after the JSON
- Start directly with { and end with }
- Include all necessary nodes, connections, and configurations
- Use proper n8n node types and parameters

Based on the conversation, create a complete n8n workflow JSON that implements the requested automation.`

      const enhancedMessages = [
        { role: "system" as const, content: workflowGenerationPrompt },
        ...messages.filter((m: any) => m.role !== "system"),
        {
          role: "user" as const,
          content: "Generate the complete n8n workflow JSON now. Output only valid JSON, no explanations.",
        },
      ]

      let aiResponse: any

      const { data: apiKeys, error } = await supabase.from("api_keys").select("provider, encrypted_key")

      if (error) {
        console.error("[v0] Error fetching API keys:", error)
        return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 })
      }

      if (!apiKeys || apiKeys.length === 0) {
        return NextResponse.json({ error: "No API keys configured" }, { status: 400 })
      }

      const claudeKey = apiKeys.find((key) => key.provider.toLowerCase().includes("claude"))
      const openaiKey = apiKeys.find((key) => key.provider.toLowerCase().includes("openai"))

      // Try OpenAI first for workflow generation
      if (openaiKey && !failedProviders.has("openai")) {
        try {
          aiResponse = await callOpenAI(openaiKey.encrypted_key, enhancedMessages)
        } catch (error) {
          console.error("[v0] OpenAI failed for workflow generation, trying Claude:", error)
          if (claudeKey) {
            try {
              aiResponse = await callClaude(claudeKey.encrypted_key, enhancedMessages)
              aiResponse.fallback = true
              aiResponse.fallbackReason = "OpenAI failed for workflow generation"
            } catch (claudeError) {
              console.error("[v0] Both providers failed for workflow generation:", claudeError)
              return NextResponse.json(
                { error: "Workflow generation failed - all AI providers unavailable" },
                { status: 503 },
              )
            }
          } else {
            throw error
          }
        }
      } else if (claudeKey) {
        try {
          aiResponse = await callClaude(claudeKey.encrypted_key, enhancedMessages)
        } catch (error) {
          console.error("[v0] Claude failed for workflow generation:", error)
          return NextResponse.json({ error: "Workflow generation failed - Claude API unavailable" }, { status: 503 })
        }
      } else {
        return NextResponse.json({ error: "No AI providers configured for workflow generation" }, { status: 400 })
      }

      console.log("[v0] Workflow generation response received")
      return NextResponse.json({
        ...aiResponse,
        isWorkflowGeneration: true,
      })
    }

    let currentState: ConversationState
    if (!conversationState) {
      const userMessage = messages[messages.length - 1]?.content || ""
      currentState = {
        phase: "discovery",
        requirements: promptingSystem.initializeRequirements(userMessage),
        completeness: 0,
        currentFocus: "Initial discovery",
      }
    } else {
      currentState = conversationState
    }

    const systemPrompt = promptingSystem.generateSystemPrompt(currentState)

    const enhancedMessages = [
      { role: "system" as const, content: systemPrompt },
      ...messages.filter((m: any) => m.role !== "system"),
    ]

    let aiResponse: any

    const { data: apiKeys, error: apiKeyError } = await supabase.from("api_keys").select("provider, encrypted_key")

    if (apiKeyError) {
      console.error("[v0] Error fetching API keys:", apiKeyError)
      return NextResponse.json({ error: "Failed to fetch API keys" }, { status: 500 })
    }

    if (!apiKeys || apiKeys.length === 0) {
      return NextResponse.json({ error: "No API keys configured" }, { status: 400 })
    }

    const claudeKey = apiKeys.find((key) => key.provider.toLowerCase().includes("claude"))
    const openaiKey = apiKeys.find((key) => key.provider.toLowerCase().includes("openai"))

    if (openaiKey && !failedProviders.has("openai")) {
      try {
        aiResponse = await callOpenAI(openaiKey.encrypted_key, enhancedMessages)
      } catch (error) {
        console.error("[v0] OpenAI API error details:", error)

        const errorMessage = error instanceof Error ? error.message : String(error)
        const errorCause = error instanceof Error ? error.cause : null

        let fallbackReason = "OpenAI API error"
        let errorCode = "OPENAI_UNKNOWN"
        let shouldFallback = false

        if (errorCause && typeof errorCause === "object") {
          const errorType = (errorCause as any).type
          const errorMsg = (errorCause as any).message || errorMessage
          const code = (errorCause as any).code

          if (code === "context_length_exceeded") {
            fallbackReason = "OpenAI context length exceeded (conversation too long)"
            errorCode = "CONTEXT_LENGTH_EXCEEDED"
            shouldFallback = true
          } else if (errorType === "insufficient_quota") {
            fallbackReason = "OpenAI API credits exhausted"
            errorCode = "CREDITS_LOW"
            shouldFallback = true
            failedProviders.add("openai")
          } else if (errorType === "rate_limit_error") {
            fallbackReason = "OpenAI API rate limit exceeded"
            errorCode = "RATE_LIMIT"
            shouldFallback = true
            failedProviders.add("openai")
          }
        }

        // Check for temporary errors
        const isTemporaryError =
          errorMessage.includes("529") ||
          errorMessage.includes("overloaded") ||
          errorMessage.includes("rate_limit") ||
          errorMessage.includes("503") ||
          errorMessage.includes("timeout") ||
          shouldFallback

        if (isTemporaryError && claudeKey) {
          console.log(`[v0] OpenAI failed (${errorCode}), falling back to Claude`)
          try {
            aiResponse = await callClaude(claudeKey.encrypted_key, enhancedMessages)
            aiResponse.fallback = true
            aiResponse.fallbackReason = fallbackReason
            aiResponse.errorCode = errorCode
            aiResponse.originalProvider = "openai"
            aiResponse.fallbackProvider = "claude"
            aiResponse.showNotification = !failedProviders.has("openai")
          } catch (claudeError) {
            console.error("[v0] Claude fallback also failed:", claudeError)
            return NextResponse.json(
              {
                error: "Both OpenAI and Claude are currently unavailable. Please try again in a moment.",
                details: `OpenAI: ${fallbackReason}, Claude fallback failed`,
                errorCode: "ALL_PROVIDERS_FAILED",
              },
              { status: 503 },
            )
          }
        } else {
          return NextResponse.json(
            {
              error: isTemporaryError
                ? `${fallbackReason} and no backup provider is configured`
                : "OpenAI API error occurred",
              details: errorMessage,
              errorCode: errorCode,
            },
            { status: 503 },
          )
        }
      }
    } else if (claudeKey) {
      try {
        aiResponse = await callClaude(claudeKey.encrypted_key, enhancedMessages)
        if (failedProviders.has("openai")) {
          aiResponse.silentFallback = true
        }
      } catch (error) {
        console.error("[v0] Claude API failed:", error)
        const errorMessage = error instanceof Error ? error.message : String(error)
        return NextResponse.json(
          {
            error: "Claude API is currently unavailable",
            details: errorMessage,
            errorCode: "CLAUDE_FAILED",
          },
          { status: 503 },
        )
      }
    } else {
      return NextResponse.json(
        {
          error: "No AI providers are configured. Please add API keys in Advanced Settings.",
          details: "Both Claude and OpenAI API keys are missing",
          errorCode: "NO_API_KEYS",
        },
        { status: 400 },
      )
    }

    const userMessage = messages[messages.length - 1]?.content || ""
    const updatedState = promptingSystem.updateConversationState(currentState, userMessage, aiResponse.content)

    return NextResponse.json({
      ...aiResponse,
      conversationState: updatedState,
      completeness: updatedState.completeness,
      phase: updatedState.phase,
      canGenerateWorkflow: promptingSystem.shouldGenerateWorkflow(updatedState),
    })
  } catch (error) {
    console.error("[v0] AI chat API error:", error)
    return NextResponse.json(
      {
        error: "Internal server error occurred while processing your request",
        details: error instanceof Error ? error.message : String(error),
        errorCode: "INTERNAL_ERROR",
      },
      { status: 500 },
    )
  }
}
