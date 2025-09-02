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
  errorCode?: string
  showNotification?: boolean
  silentFallback?: boolean
}

class AIService {
  private static instance: AIService
  private abortController: AbortController | null = null

  static getInstance(): AIService {
    if (!AIService.instance) {
      AIService.instance = new AIService()
    }
    return AIService.instance
  }

  /**
   * Generate AI response for conversation
   */
  async generateResponse(
    messages: AIMessage[],
    conversationState?: ConversationState | null,
    options?: {
      isWorkflowGeneration?: boolean
      timeout?: number
    },
  ): Promise<AIResponse> {
    const { isWorkflowGeneration = false, timeout = 30000 } = options || {}

    console.log("[v0] AI Service: Generating response", {
      messageCount: messages.length,
      isWorkflowGeneration,
      hasConversationState: !!conversationState,
      phase: conversationState?.phase,
      completeness: conversationState?.completeness,
    })

    // Cancel any existing request
    if (this.abortController) {
      this.abortController.abort()
    }

    this.abortController = new AbortController()

    try {
      const timeoutId = setTimeout(() => {
        this.abortController?.abort()
      }, timeout)

      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages,
          conversationState,
          isWorkflowGeneration,
        }),
        signal: this.abortController.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: "Unknown error occurred",
        }))

        // Provide more specific error messages
        let errorMessage = error.error || "AI service request failed"

        if (error.errorCode === "NO_API_KEYS") {
          errorMessage = "Please configure your API keys in the Advanced Settings panel to use the AI features."
        } else if (error.errorCode === "CREDITS_LOW") {
          errorMessage = "Your API credits are running low. The service has switched to a backup provider."
        } else if (error.errorCode === "RATE_LIMIT") {
          errorMessage = "Rate limit exceeded. Please wait a moment before trying again."
        } else if (error.errorCode === "ALL_PROVIDERS_FAILED") {
          errorMessage = "All AI providers are currently unavailable. Please try again in a few minutes."
        }

        throw new Error(errorMessage)
      }

      const data = await response.json()

      console.log("[v0] AI Service: Response received", {
        provider: data.provider,
        hasContent: !!data.content,
        contentLength: data.content?.length,
        isWorkflowGeneration: data.isWorkflowGeneration,
        phase: data.phase,
        completeness: data.completeness,
      })

      // Validate response
      if (!data.content) {
        throw new Error("AI service returned empty response")
      }

      return data
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === "AbortError") {
          throw new Error("Request timed out. Please try again.")
        }
        throw error
      }
      throw new Error("An unexpected error occurred while communicating with the AI service.")
    } finally {
      this.abortController = null
    }
  }

  /**
   * Generate n8n workflow JSON
   */
  async generateWorkflowJson(conversationHistory: AIMessage[]): Promise<string> {
    console.log("[v0] AI Service: Generating workflow JSON")

    try {
      const response = await this.generateResponse(conversationHistory, null, {
        isWorkflowGeneration: true,
        timeout: 60000, // Longer timeout for workflow generation
      })

      let workflowJson = response.content.trim()

      // Clean up the JSON
      workflowJson = this.cleanJsonResponse(workflowJson)

      // Validate JSON structure
      const parsed = JSON.parse(workflowJson)

      // Validate it has required n8n workflow properties
      if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
        throw new Error("Invalid workflow structure: missing nodes array")
      }

      if (!parsed.connections || typeof parsed.connections !== "object") {
        throw new Error("Invalid workflow structure: missing connections object")
      }

      console.log("[v0] AI Service: Valid workflow JSON generated", {
        nodeCount: parsed.nodes.length,
        hasConnections: Object.keys(parsed.connections).length > 0,
      })

      return workflowJson
    } catch (error) {
      console.error("[v0] AI Service: Workflow generation failed", error)

      if (error instanceof SyntaxError) {
        throw new Error("Generated workflow is not valid JSON. Please try again.")
      }

      throw error
    }
  }

  /**
   * Clean JSON response from AI
   */
  private cleanJsonResponse(text: string): string {
    // Remove markdown code blocks
    text = text.replace(/```(?:json)?\s*/g, "").replace(/\s*```/g, "")

    // Extract JSON object if wrapped in text
    const jsonStart = text.indexOf("{")
    const jsonEnd = text.lastIndexOf("}")

    if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
      text = text.substring(jsonStart, jsonEnd + 1)
    }

    // Fix common JSON issues
    text = text
      .replace(/,\s*}/g, "}") // Remove trailing commas in objects
      .replace(/,\s*]/g, "]") // Remove trailing commas in arrays
      .replace(/'/g, '"') // Replace single quotes with double quotes
      .replace(/(\w+):/g, '"$1":') // Add quotes to unquoted keys
      .replace(/:"([^"]*)":/g, ':"$1","') // Fix missing commas between properties

    return text
  }

  /**
   * Check if service is available
   */
  async checkAvailability(): Promise<{
    available: boolean
    providers: string[]
    message?: string
  }> {
    try {
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: "test" }],
          isHealthCheck: true,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        return {
          available: true,
          providers: data.availableProviders || ["claude", "openai"],
        }
      }

      return {
        available: false,
        providers: [],
        message: "AI service is currently unavailable",
      }
    } catch (error) {
      return {
        available: false,
        providers: [],
        message: "Cannot connect to AI service",
      }
    }
  }

  /**
   * Cancel ongoing request
   */
  cancelRequest(): void {
    if (this.abortController) {
      this.abortController.abort()
      this.abortController = null
      console.log("[v0] AI Service: Request cancelled")
    }
  }
}

// Export singleton instance
export const aiService = AIService.getInstance()
