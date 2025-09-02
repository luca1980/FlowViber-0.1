export interface WorkflowData {
  id: string
  name: string
  description?: string
  chat_history: Array<{
    id: string
    content: string
    sender: "user" | "ai"
    timestamp: string
    provider?: string
    error?: boolean
  }>
  workflow_json?: any
  status: "draft" | "active" | "completed" | "generated" | "deployed"
  created_at: string
  updated_at: string
  version?: number // Add version for optimistic concurrency
  n8n_workflow_id?: string
  deployed_at?: string
  last_sync_at?: string
}

export class WorkflowStorage {
  private static instance: WorkflowStorage
  private pendingUpdates = new Map<string, NodeJS.Timeout>()

  static getInstance(): WorkflowStorage {
    if (!WorkflowStorage.instance) {
      WorkflowStorage.instance = new WorkflowStorage()
    }
    return WorkflowStorage.instance
  }

  async createWorkflow(name: string, description?: string): Promise<WorkflowData | null> {
    try {
      console.log("[v0] WorkflowStorage.createWorkflow called with:", { name, description })

      const response = await fetch("/api/workflows", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name, description }),
      })

      console.log("[v0] API response status:", response.status)
      console.log("[v0] API response ok:", response.ok)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] API error response:", errorText)
        throw new Error(`Failed to create workflow: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log("[v0] API response data:", result)

      return result.workflow
    } catch (error) {
      console.error("[v0] Error creating workflow:", error)
      throw error
    }
  }

  async updateWorkflowChatHistory(workflowId: string, chatHistory: any[]): Promise<boolean> {
    // Cancel any pending update for this workflow
    if (this.pendingUpdates.has(workflowId)) {
      clearTimeout(this.pendingUpdates.get(workflowId))
    }

    return new Promise((resolve) => {
      const timeoutId = setTimeout(async () => {
        try {
          console.log("[v0] WorkflowStorage.updateWorkflowChatHistory executing for:", workflowId)
          console.log("[v0] Updating with", chatHistory.length, "messages")

          // First, get the current workflow to check version
          const currentWorkflow = await this.getWorkflow(workflowId)
          if (!currentWorkflow) {
            console.error("[v0] Workflow not found:", workflowId)
            resolve(false)
            return
          }

          // This prevents rejecting valid saves when messages are just being processed in different orders
          if (currentWorkflow.chat_history.length > chatHistory.length + 2) {
            console.log("[v0] Skipping update - current history is significantly longer")
            console.log("[v0] Current:", currentWorkflow.chat_history.length, "New:", chatHistory.length)
            resolve(false)
            return
          }

          // If same length or close, check if content is actually different
          if (Math.abs(currentWorkflow.chat_history.length - chatHistory.length) <= 2) {
            const currentHash = JSON.stringify(currentWorkflow.chat_history.map((m) => m.id + m.content))
            const newHash = JSON.stringify(chatHistory.map((m) => m.id + m.content))

            if (currentHash === newHash) {
              console.log("[v0] Skipping update - content identical")
              resolve(true)
              return
            }
          }

          const response = await fetch(`/api/workflows/${workflowId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              chat_history: chatHistory,
              expected_version: currentWorkflow.version || 1,
            }),
          })

          console.log("[v0] Update API response status:", response.status)

          if (response.status === 409) {
            console.log("[v0] Concurrent update detected, skipping")
            resolve(false)
            return
          }

          if (!response.ok) {
            const errorText = await response.text()
            console.error("[v0] Update API error response:", errorText)
            throw new Error("Failed to update workflow")
          }

          const result = await response.json()
          console.log("[v0] Update API success:", result)
          resolve(true)
        } catch (error) {
          console.error("[v0] Error updating chat history:", error)
          resolve(false)
        } finally {
          this.pendingUpdates.delete(workflowId)
        }
      }, 1000) // 1 second debounce

      this.pendingUpdates.set(workflowId, timeoutId)
      console.log("[v0] Scheduled update for workflow:", workflowId)
    })
  }

  async updateWorkflowJsonAndStatus(
    workflowId: string,
    workflowJson: any,
    status: "draft" | "active" | "completed" | "generated" | "deployed",
  ): Promise<boolean> {
    try {
      console.log("[v0] WorkflowStorage.updateWorkflowJsonAndStatus called for:", workflowId)
      console.log("[v0] Status:", status)
      console.log("[v0] JSON nodes:", workflowJson.nodes?.length || 0)

      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflow_json: workflowJson,
          status: status,
        }),
      })

      console.log("[v0] Update JSON API response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Update JSON API error response:", errorText)
        throw new Error(`Failed to update workflow JSON: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log("[v0] Update JSON API success:", result)
      return true
    } catch (error) {
      console.error("[v0] Error updating workflow JSON and status:", error)
      return false
    }
  }

  async getWorkflows(): Promise<WorkflowData[]> {
    try {
      console.log("[v0] WorkflowStorage: Fetching workflows from API...")
      const response = await fetch("/api/workflows")

      if (!response.ok) throw new Error("Failed to fetch workflows")

      const { workflows } = await response.json()
      console.log("[v0] WorkflowStorage: Received", workflows.length, "workflows from API")

      workflows.forEach((workflow: WorkflowData, index: number) => {
        console.log(`[v0] WorkflowStorage: Complete Workflow ${index + 1}:`, {
          id: workflow.id,
          name: workflow.name,
          status: workflow.status,
          n8n_workflow_id: workflow.n8n_workflow_id,
          has_workflow_json: !!workflow.workflow_json,
          workflow_json_nodes: workflow.workflow_json?.nodes?.length || 0,
          deployed_at: workflow.deployed_at,
          last_sync_at: workflow.last_sync_at,
          chat_history_length: workflow.chat_history?.length || 0,
        })
      })

      return workflows
    } catch (error) {
      console.error("[v0] Error fetching workflows:", error)
      return []
    }
  }

  async getWorkflow(workflowId: string): Promise<WorkflowData | null> {
    try {
      const response = await fetch(`/api/workflows/${workflowId}`)

      if (!response.ok) throw new Error("Failed to fetch workflow")

      const { workflow } = await response.json()
      return workflow
    } catch (error) {
      console.error("[v0] Error fetching workflow:", error)
      return null
    }
  }

  async deleteWorkflow(workflowId: string): Promise<boolean> {
    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "DELETE",
      })

      if (!response.ok) throw new Error("Failed to delete workflow")

      return true
    } catch (error) {
      console.error("[v0] Error deleting workflow:", error)
      return false
    }
  }

  async forceSave(workflowId: string, chatHistory: any[]): Promise<boolean> {
    if (this.pendingUpdates.has(workflowId)) {
      clearTimeout(this.pendingUpdates.get(workflowId))
      this.pendingUpdates.delete(workflowId)
    }

    try {
      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ chat_history: chatHistory, force: true }),
      })

      return response.ok
    } catch (error) {
      console.error("[v0] Force save error:", error)
      return false
    }
  }

  async updateWorkflowStatus(
    workflowId: string,
    status: "draft" | "active" | "completed" | "generated" | "deployed",
  ): Promise<boolean> {
    try {
      console.log("[v0] WorkflowStorage.updateWorkflowStatus called for:", workflowId)
      console.log("[v0] New status:", status)

      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: status,
        }),
      })

      console.log("[v0] Update status API response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Update status API error response:", errorText)
        throw new Error(`Failed to update workflow status: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log("[v0] Update status API success:", result)
      return true
    } catch (error) {
      console.error("[v0] Error updating workflow status:", error)
      return false
    }
  }

  async updateWorkflowMetadata(
    workflowId: string,
    metadata: {
      n8n_workflow_id?: string
      deployed_at?: string
      last_sync_at?: string
    },
  ): Promise<boolean> {
    try {
      console.log("[v0] WorkflowStorage.updateWorkflowMetadata called for:", workflowId)
      console.log("[v0] Metadata:", metadata)

      const response = await fetch(`/api/workflows/${workflowId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(metadata),
      })

      console.log("[v0] Update metadata API response status:", response.status)

      if (!response.ok) {
        const errorText = await response.text()
        console.error("[v0] Update metadata API error response:", errorText)
        throw new Error(`Failed to update workflow metadata: ${response.status} ${errorText}`)
      }

      const result = await response.json()
      console.log("[v0] Update metadata API success:", result)
      return true
    } catch (error) {
      console.error("[v0] Error updating workflow metadata:", error)
      return false
    }
  }
}

export const workflowStorage = new WorkflowStorage()

export default WorkflowStorage
