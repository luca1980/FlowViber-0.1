// n8n API integration service
import { createClient } from "@supabase/supabase-js"

interface N8nWorkflow {
  id?: string
  name: string
  nodes: any[]
  connections: any
  active?: boolean
  settings?: any
}

interface N8nExecution {
  id: string
  workflowId: string
  mode: string
  retryOf?: string
  status: "new" | "running" | "success" | "error" | "canceled" | "crashed" | "waiting"
  startedAt: string
  stoppedAt?: string
  workflowData: any
  data?: any
}

interface N8nApiResponse<T> {
  data: T
  nextCursor?: string
}

class N8nApiService {
  private supabase: any

  constructor() {
    // Use service role key to ensure we can read any user's data
    this.supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  }

  private async getN8nApiKey(userId?: string): Promise<string> {
    console.log("[v0] N8nApi: Getting API key for user:", userId || "not provided")

    // If userId provided, get from database
    if (userId) {
      try {
        console.log("[v0] N8nApi: Querying database for n8n API key...")
        const { data: apiKey, error } = await this.supabase
          .from("api_keys")
          .select("encrypted_key")
          .eq("user_id", userId)
          .eq("provider", "n8n")
          .single()

        console.log("[v0] N8nApi: Database query result:", {
          hasData: !!apiKey,
          error: error?.message || null,
          userId,
        })

        if (error) {
          console.log("[v0] N8nApi: Database error (non-fatal):", error.message)
          // Don't throw here, try fallback options
        }

        if (apiKey?.encrypted_key) {
          console.log("[v0] N8nApi: Found n8n API key in database for user")
          return apiKey.encrypted_key
        } else {
          console.log("[v0] N8nApi: No n8n API key found in database for user:", userId)
        }
      } catch (error) {
        console.error("[v0] N8nApi: Error retrieving API key from database:", error)
      }

      // Try default user as fallback
      try {
        console.log("[v0] N8nApi: Trying default user as fallback...")
        const defaultUserId = "00000000-0000-0000-0000-000000000001"
        const { data: defaultApiKey, error } = await this.supabase
          .from("api_keys")
          .select("encrypted_key")
          .eq("user_id", defaultUserId)
          .eq("provider", "n8n")
          .single()

        if (defaultApiKey?.encrypted_key) {
          console.log("[v0] N8nApi: Found n8n API key using default user fallback")
          return defaultApiKey.encrypted_key
        }
      } catch (fallbackError) {
        console.log("[v0] N8nApi: Default user fallback also failed")
      }
    } else {
      console.log("[v0] N8nApi: No userId provided, skipping database lookup")
    }

    // Try environment variable as last resort
    const envKey = process.env.N8N_API_KEY
    if (envKey) {
      console.log("[v0] N8nApi: Using environment variable N8N_API_KEY")
      return envKey
    }

    console.log("[v0] N8nApi: No API key found in database or environment")
    throw new Error("n8n API key not configured. Please add it in the Advanced Settings tab (right panel).")
  }

  private async getN8nBaseUrl(userId?: string): Promise<string> {
    console.log("[v0] N8nApi: Getting base URL for user:", userId || "not provided")

    // If userId provided, get from user profile
    if (userId) {
      try {
        console.log("[v0] N8nApi: Querying profile for n8n instance URL...")
        const { data: profile, error } = await this.supabase
          .from("profiles")
          .select("n8n_instance_url")
          .eq("id", userId)
          .single()

        console.log("[v0] N8nApi: Profile query result:", {
          hasData: !!profile,
          hasUrl: !!profile?.n8n_instance_url,
          error: error?.message || null,
        })

        if (error) {
          console.log("[v0] N8nApi: Profile error (non-fatal):", error.message)
        }

        if (profile?.n8n_instance_url) {
          console.log("[v0] N8nApi: Found base URL in profile:", profile.n8n_instance_url)
          return profile.n8n_instance_url
        } else {
          console.log("[v0] N8nApi: No base URL found in profile for user:", userId)
        }
      } catch (error) {
        console.error("[v0] N8nApi: Error retrieving base URL from profile:", error)
      }

      // Try default user profile as fallback
      try {
        console.log("[v0] N8nApi: Trying default user profile as fallback...")
        const defaultUserId = "00000000-0000-0000-0000-000000000001"
        const { data: defaultProfile } = await this.supabase
          .from("profiles")
          .select("n8n_instance_url")
          .eq("id", defaultUserId)
          .single()

        if (defaultProfile?.n8n_instance_url) {
          console.log("[v0] N8nApi: Found base URL using default user fallback")
          return defaultProfile.n8n_instance_url
        }
      } catch (fallbackError) {
        console.log("[v0] N8nApi: Default user profile fallback also failed")
      }
    } else {
      console.log("[v0] N8nApi: No userId provided, skipping profile lookup")
    }

    // Try environment variable as fallback
    const envUrl = process.env.NEXT_PUBLIC_N8N_BASE_URL || process.env.N8N_BASE_URL
    if (envUrl) {
      console.log("[v0] N8nApi: Using environment variable for base URL:", envUrl)
      return envUrl
    }

    console.log("[v0] N8nApi: No base URL found in profile or environment")
    throw new Error("n8n instance URL not configured. Please add it in the Advanced Settings tab (right panel).")
  }

  private async makeRequest<T>(endpoint: string, options: RequestInit = {}, userId?: string): Promise<T> {
    console.log("[v0] N8nApi: Making request to:", endpoint)
    console.log("[v0] N8nApi: With userId:", userId || "not provided")

    try {
      const apiKey = await this.getN8nApiKey(userId)
      const baseUrl = await this.getN8nBaseUrl(userId)

      // Ensure base URL doesn't have trailing slash
      const cleanBaseUrl = baseUrl.replace(/\/$/, "")
      const url = `${cleanBaseUrl}/api/v1${endpoint}`

      console.log("[v0] N8nApi: Full request URL:", url)
      console.log("[v0] N8nApi: Has API key:", !!apiKey)
      console.log("[v0] N8nApi: Request method:", options.method || "GET")

      const response = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-N8N-API-KEY": apiKey,
          ...options.headers,
        },
      })

      console.log("[v0] N8nApi: Response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] N8nApi: Error response:", errorText)

        // Provide more specific error messages
        if (response.status === 401) {
          throw new Error("n8n API authentication failed. Please check your API key.")
        } else if (response.status === 404) {
          throw new Error("n8n endpoint not found. Please check your instance URL and ensure the API is enabled.")
        } else if (response.status === 500) {
          throw new Error("n8n server error. Please check your n8n instance.")
        } else {
          throw new Error(`n8n API error (${response.status}): ${errorText}`)
        }
      }

      const result = await response.json()
      console.log("[v0] N8nApi: Request successful")
      return result
    } catch (error) {
      console.error("[v0] N8nApi: Request failed:", error)

      // Re-throw with more context if it's our custom error
      if (error instanceof Error && error.message.includes("not configured")) {
        throw error
      }

      // Wrap other errors with more context
      throw new Error(`n8n API request failed: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  // Deploy workflow to n8n (create new workflow)
  async deployWorkflow(workflowJson: any, workflowName: string, userId?: string): Promise<N8nWorkflow> {
    console.log("[v0] N8nApi: Starting deployment for workflow:", workflowName)
    console.log("[v0] N8nApi: User ID for deployment:", userId || "not provided")

    const workflowData = {
      name: workflowName,
      nodes: workflowJson.nodes || [],
      connections: workflowJson.connections || {},
      settings: workflowJson.settings || { executionOrder: "v1" },
    }

    console.log("[v0] N8nApi: Workflow data prepared:", {
      name: workflowData.name,
      nodeCount: workflowData.nodes.length,
      hasConnections: Object.keys(workflowData.connections).length > 0,
      settings: workflowData.settings,
    })

    const result = await this.makeRequest<N8nWorkflow>(
      "/workflows",
      {
        method: "POST",
        body: JSON.stringify(workflowData),
      },
      userId,
    )

    console.log("[v0] N8nApi: Workflow deployed successfully with ID:", result.id)
    return result
  }

  // Retrieve workflow errors (get failed executions)
  async getWorkflowErrors(workflowId?: string, userId?: string): Promise<N8nExecution[]> {
    console.log("[v0] N8nApi: Retrieving workflow errors for workflow:", workflowId || "all")

    let endpoint = "/executions?status=error&limit=50"
    if (workflowId) {
      endpoint += `&workflowId=${workflowId}`
    }

    const result = await this.makeRequest<N8nApiResponse<N8nExecution[]>>(endpoint, {}, userId)

    console.log("[v0] N8nApi: Retrieved", result.data.length, "error executions")
    return result.data
  }

  // Sync workflow from n8n (get existing workflow)
  async syncWorkflowFromN8n(workflowId: string, userId?: string): Promise<N8nWorkflow> {
    console.log("[v0] N8nApi: Syncing workflow from n8n:", workflowId)

    const result = await this.makeRequest<N8nWorkflow>(`/workflows/${workflowId}`, {}, userId)

    console.log("[v0] N8nApi: Workflow synced successfully:", result.name)
    return result
  }

  // Push workflow to n8n (update existing workflow)
  async pushWorkflowToN8n(
    workflowId: string,
    workflowJson: any,
    workflowName: string,
    userId?: string,
  ): Promise<N8nWorkflow> {
    console.log("[v0] N8nApi: Pushing workflow to n8n:", workflowId)

    const workflowData = {
      name: workflowName,
      nodes: workflowJson.nodes || [],
      connections: workflowJson.connections || {},
      settings: workflowJson.settings || { executionOrder: "v1" },
    }

    const result = await this.makeRequest<N8nWorkflow>(
      `/workflows/${workflowId}`,
      {
        method: "PUT",
        body: JSON.stringify(workflowData),
      },
      userId,
    )

    console.log("[v0] N8nApi: Workflow pushed successfully")
    return result
  }

  // Get all workflows from n8n
  async getWorkflows(userId?: string): Promise<N8nWorkflow[]> {
    console.log("[v0] N8nApi: Getting all workflows from n8n")

    const result = await this.makeRequest<N8nApiResponse<N8nWorkflow[]>>("/workflows", {}, userId)

    console.log("[v0] N8nApi: Retrieved", result.data.length, "workflows")
    return result.data
  }

  // Test API connection
  async testConnection(userId?: string): Promise<boolean> {
    try {
      console.log("[v0] N8nApi: Testing connection for user:", userId || "not provided")
      await this.makeRequest("/workflows?limit=1", {}, userId)
      console.log("[v0] N8nApi: Connection test successful")
      return true
    } catch (error) {
      console.error("[v0] N8nApi: Connection test failed:", error)
      return false
    }
  }
}

// Export singleton instance
export const n8nApi = new N8nApiService()
export default n8nApi
