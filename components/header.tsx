"use client"
import { Button } from "@/components/ui/button"
import { AlertTriangle, Database, GitBranch, Upload, Sparkles, Info } from "lucide-react"
import { useState } from "react"
import { useToast } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

type WorkflowStatus = "draft" | "generated" | "deployed"

interface HeaderProps {
  onAIBuilderClick?: () => void
  hasWorkflow?: boolean
  workflowJson?: string | null
  workflowStatus?: WorkflowStatus
  onStatusChange?: (status: WorkflowStatus) => void
  onWorkflowRefresh?: () => void // Added callback to trigger workflow refresh
  onDeploymentSuccess?: (result: { n8nWorkflowId: string; message: string }) => void // Added deployment success callback
  workflowId?: string
  workflowName?: string
  n8nWorkflowId?: string
}

export default function Header({
  onAIBuilderClick,
  hasWorkflow = false,
  workflowJson,
  workflowStatus = "draft",
  onStatusChange,
  onWorkflowRefresh, // Added workflow refresh callback
  onDeploymentSuccess, // Added deployment success callback prop
  workflowId,
  workflowName,
  n8nWorkflowId,
}: HeaderProps) {
  const { addToast } = useToast()
  const [isDeploying, setIsDeploying] = useState(false)
  const [isRetrievingErrors, setIsRetrievingErrors] = useState(false)
  const [isSyncing, setIsSyncing] = useState(false)
  const [isPushing, setIsPushing] = useState(false)

  const verifyWorkflowStatus = async (workflowId: string, expectedStatus: WorkflowStatus) => {
    try {
      const response = await fetch(`/api/workflows/${workflowId}`)
      const data = await response.json()

      if (data.workflow?.status !== expectedStatus) {
        console.warn(`[v0] Status mismatch detected. Expected: ${expectedStatus}, Got: ${data.workflow?.status}`)

        // Attempt to restore correct status if n8n_workflow_id exists
        if (data.workflow?.n8n_workflow_id && expectedStatus === "deployed") {
          console.log(`[v0] Attempting to restore deployed status for workflow ${workflowId}`)
          await fetch(`/api/workflows/${workflowId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "deployed" }),
          })
        }
      }

      return data.workflow?.status
    } catch (error) {
      console.error("[v0] Status verification failed:", error)
      return null
    }
  }

  const handleDeploy = async () => {
    if (!workflowJson || !workflowId || !workflowName) {
      addToast({
        type: "warning",
        title: "Missing Information",
        description: "Workflow data is incomplete. Please generate a workflow first.",
      })
      return
    }

    setIsDeploying(true)
    try {
      console.log("[v0] Header: Deploying workflow to n8n:", workflowName)

      const response = await fetch("/api/n8n/deploy", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId,
          workflowJson: JSON.parse(workflowJson),
          workflowName,
        }),
      })

      if (!response.ok) {
        let errorMessage = "Failed to deploy workflow"
        try {
          const error = await response.json()
          errorMessage = error.error || errorMessage
        } catch (jsonError) {
          // If response is not JSON (e.g., HTML error page), get text content
          const textContent = await response.text()
          console.error("[v0] Header: Non-JSON error response:", textContent)
          errorMessage = `Server error (${response.status}): ${response.statusText}`
        }
        throw new Error(errorMessage)
      }

      let result
      try {
        result = await response.json()
      } catch (jsonError) {
        console.error("[v0] Header: Failed to parse success response as JSON")
        throw new Error("Invalid response format from server")
      }

      console.log("[v0] Header: Deployment successful:", result)

      addToast({
        type: "success",
        title: "🎉 Deployment Successful!",
        description: `Workflow "${workflowName}" has been successfully deployed to n8n with ID: ${result.n8nWorkflowId}`,
        duration: 10000, // Show for 10 seconds for better visibility
      })

      console.log(`[v0] 🎉 SUCCESS: Workflow "${workflowName}" deployed to n8n with ID: ${result.n8nWorkflowId}`)

      alert(`🎉 SUCCESS! Workflow "${workflowName}" deployed to n8n with ID: ${result.n8nWorkflowId}`)

      if (onDeploymentSuccess) {
        console.log("[v0] Header: Calling onDeploymentSuccess callback")
        onDeploymentSuccess({
          n8nWorkflowId: result.n8nWorkflowId,
          message: result.message || `Workflow "${workflowName}" deployed successfully to n8n!`,
        })
      } else {
        console.log("[v0] Header: No onDeploymentSuccess callback, using fallback")
        // Fallback to old behavior if callback not provided
        onStatusChange?.("deployed")
        if (onWorkflowRefresh) {
          console.log("[v0] Header: Triggering workflow refresh after deployment")
          onWorkflowRefresh()
        }
      }
    } catch (error) {
      console.error("[v0] Header: Deployment error:", error)

      let errorTitle = "Deployment Failed"
      let errorDescription = "Failed to deploy workflow. Please check your n8n configuration."

      if (error instanceof Error) {
        const errorMsg = error.message.toLowerCase()
        if (errorMsg.includes("api key not configured") || errorMsg.includes("api key missing")) {
          errorTitle = "n8n Configuration Required"
          errorDescription =
            "Please configure your n8n API key and instance URL in the Advanced tab (right panel) before deploying."
        } else if (errorMsg.includes("base url") || errorMsg.includes("instance url")) {
          errorTitle = "n8n Instance URL Required"
          errorDescription =
            "Please configure your n8n instance URL in the Advanced tab (right panel) before deploying."
        } else {
          errorDescription = error.message
        }
      }

      addToast({
        type: "error",
        title: errorTitle,
        description: errorDescription,
      })
    } finally {
      setIsDeploying(false)
    }
  }

  const handleRetrieveErrors = async () => {
    if (!n8nWorkflowId) {
      addToast({
        type: "warning",
        title: "No n8n Workflow ID",
        description: "Cannot retrieve errors without n8n workflow ID.",
      })
      return
    }

    setIsRetrievingErrors(true)
    try {
      console.log("[v0] Header: Retrieving errors for n8n workflow:", n8nWorkflowId)

      const response = await fetch(`/api/n8n/errors?workflowId=${n8nWorkflowId}`)

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to retrieve errors")
      }

      const result = await response.json()
      console.log("[v0] Header: Retrieved", result.errors.length, "errors")

      if (result.errors.length === 0) {
        addToast({
          type: "success",
          title: "No Errors Found",
          description: "Your workflow is running smoothly with no recent errors.",
        })
      } else {
        addToast({
          type: "warning",
          title: "Errors Found",
          description: `Found ${result.errors.length} error(s) in recent executions. Check the console for details.`,
        })
        console.table(result.errors)
      }
    } catch (error) {
      console.error("[v0] Header: Error retrieval failed:", error)
      addToast({
        type: "error",
        title: "Error Retrieval Failed",
        description: error instanceof Error ? error.message : "Failed to retrieve workflow errors.",
      })
    } finally {
      setIsRetrievingErrors(false)
    }
  }

  const handleSync = async () => {
    console.log("[v0] Header: Sync button clicked", { n8nWorkflowId, workflowId, areManagementButtonsEnabled })

    if (!n8nWorkflowId || !workflowId) {
      console.log("[v0] Header: Sync blocked - missing IDs", { n8nWorkflowId, workflowId })
      addToast({
        type: "warning",
        title: "Missing Information",
        description: "Cannot sync without workflow IDs.",
      })
      return
    }

    setIsSyncing(true)
    try {
      console.log("[v0] Header: Syncing workflow from n8n:", n8nWorkflowId)

      const response = await fetch("/api/n8n/sync", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          workflowId,
          n8nWorkflowId,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to sync workflow")
      }

      const result = await response.json()
      console.log("[v0] Header: Sync successful:", result)

      addToast({
        type: "success",
        title: "✅ Sync Successful",
        description: `Workflow "${workflowName || "Unknown"}" has been synchronized from n8n and updated locally.`,
        duration: 5000,
      })

      // Verify and maintain deployed status
      await verifyWorkflowStatus(workflowId, "deployed")

      // Trigger workflow refresh to update UI with synced data
      if (onWorkflowRefresh) {
        console.log("[v0] Header: Triggering workflow refresh after sync")
        onWorkflowRefresh()
      }
    } catch (error) {
      console.error("[v0] Header: Sync error:", error)
      addToast({
        type: "error",
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync workflow from n8n.",
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const handlePush = async () => {
    if (!n8nWorkflowId || !workflowJson || !workflowName) {
      addToast({
        type: "warning",
        title: "Missing Information",
        description: "Cannot push without complete workflow data.",
      })
      return
    }

    setIsPushing(true)
    try {
      console.log("[v0] Header: Pushing workflow to n8n:", n8nWorkflowId)

      const response = await fetch("/api/n8n/push", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          n8nWorkflowId,
          workflowJson: JSON.parse(workflowJson),
          workflowName,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to push workflow")
      }

      const result = await response.json()
      console.log("[v0] Header: Push successful:", result)

      addToast({
        type: "success",
        title: "Push Successful",
        description: `Workflow "${workflowName}" has been updated in n8n.`,
      })

      if (workflowId) {
        setTimeout(async () => {
          const actualStatus = await verifyWorkflowStatus(workflowId, "deployed")
          if (actualStatus === "deployed") {
            console.log("[v0] Header: Status verification passed - workflow remains deployed")
          } else {
            console.warn("[v0] Header: Status verification failed - triggering refresh")
            onWorkflowRefresh?.()
          }
        }, 1000) // Small delay to allow backend to complete
      }
    } catch (error) {
      console.error("[v0] Header: Push error:", error)
      addToast({
        type: "error",
        title: "Push Failed",
        description: error instanceof Error ? error.message : "Failed to push workflow to n8n.",
      })
    } finally {
      setIsPushing(false)
    }
  }

  const isDeployEnabled = workflowStatus === "generated" && hasWorkflow && workflowJson
  const areManagementButtonsEnabled = workflowStatus === "deployed"

  const getButtonClasses = (enabled: boolean, baseClasses: string) => {
    return enabled ? baseClasses : `${baseClasses} opacity-50 cursor-not-allowed`
  }

  return (
    <TooltipProvider>
      <header className="bg-slate-800 border-b border-slate-700 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">FV</span>
            </div>
            <span className="text-white font-semibold">Flow Viber</span>
          </div>
          <span className="text-xs text-slate-400">n8n Workflow Builder</span>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className={getButtonClasses(
                  isDeployEnabled,
                  "bg-green-600 hover:bg-green-700 text-white disabled:opacity-50",
                )}
                onClick={handleDeploy}
                disabled={!isDeployEnabled || isDeploying}
              >
                <Database className="w-4 h-4 mr-1" />
                {isDeploying ? "Deploying..." : "Deploy to n8n"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {workflowStatus === "draft"
                ? "Generate a workflow first before deploying"
                : workflowStatus === "generated"
                  ? "Deploy generated workflow to your n8n instance"
                  : "Workflow already deployed"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className={getButtonClasses(
                  areManagementButtonsEnabled,
                  "border-orange-500 text-orange-500 hover:bg-orange-500 hover:text-white bg-transparent",
                )}
                onClick={() => areManagementButtonsEnabled && handleRetrieveErrors()}
                disabled={!areManagementButtonsEnabled || isRetrievingErrors}
              >
                <AlertTriangle className="w-4 h-4 mr-1" />
                {isRetrievingErrors ? "Retrieving..." : "Retrieve Errors"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {areManagementButtonsEnabled
                ? "View and debug workflow execution errors from n8n"
                : "Deploy workflow first to access error retrieval"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className={getButtonClasses(
                  areManagementButtonsEnabled,
                  "border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white bg-transparent",
                )}
                onClick={handleSync}
                disabled={!areManagementButtonsEnabled || isSyncing}
              >
                <GitBranch className="w-4 h-4 mr-1" />
                {isSyncing ? "Syncing..." : "Sync from n8n"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {areManagementButtonsEnabled
                ? "Import existing workflows from your n8n instance"
                : "Deploy workflow first to access sync functionality"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                variant="outline"
                className={getButtonClasses(
                  areManagementButtonsEnabled,
                  "border-blue-500 text-blue-500 hover:bg-blue-500 hover:text-white bg-transparent",
                )}
                onClick={() => areManagementButtonsEnabled && handlePush()}
                disabled={!areManagementButtonsEnabled || isPushing}
              >
                <Upload className="w-4 h-4 mr-1" />
                {isPushing ? "Pushing..." : "Push to n8n"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {areManagementButtonsEnabled
                ? "Update existing workflow in your n8n instance"
                : "Deploy workflow first to access push functionality"}
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                size="sm"
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                onClick={onAIBuilderClick}
              >
                <Sparkles className="w-4 h-4 mr-1" />
                AI Builder
                <Info className="w-3 h-3 ml-1" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open AI-powered workflow builder assistant</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  )
}
