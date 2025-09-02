"use client"

import { useState, useRef } from "react"
import Header from "@/components/header"
import Sidebar from "@/components/sidebar"
import AIConversationBuilder from "@/components/ai-conversation-builder"
import RightPanel from "@/components/right-panel"
import type { WorkflowData } from "@/lib/workflow-storage"
import WorkflowStorage from "@/lib/workflow-storage"

type WorkflowStatus = "draft" | "generated" | "deployed"

export default function Home() {
  const [currentWorkflow, setCurrentWorkflow] = useState<WorkflowData | null>(null)
  const [generatedWorkflowJson, setGeneratedWorkflowJson] = useState<string | null>(null)
  const [workflowStatus, setWorkflowStatus] = useState<WorkflowStatus>("draft")
  const sidebarRefreshRef = useRef<(() => void) | null>(null)
  const [isSyncInProgress, setIsSyncInProgress] = useState(false)

  const handleWorkflowSelect = (workflow: WorkflowData) => {
    console.log("[v0] Main: Workflow selected:", workflow)
    setCurrentWorkflow(workflow)

    if (!isSyncInProgress) {
      const status = (workflow.status as WorkflowStatus) || "draft"
      setWorkflowStatus(status)
      console.log("[v0] Main: Workflow status set to:", status)
    } else {
      console.log("[v0] Main: Sync in progress, preserving current status:", workflowStatus)
    }

    if (workflow.workflow_json) {
      console.log("[v0] Main: Loading stored workflow JSON")
      setGeneratedWorkflowJson(JSON.stringify(workflow.workflow_json, null, 2))
    } else {
      console.log("[v0] Main: No stored workflow JSON found")
      setGeneratedWorkflowJson(null)
    }
  }

  const handleWorkflowCreated = (workflow: WorkflowData) => {
    setCurrentWorkflow(workflow)
    setGeneratedWorkflowJson(null)
    setWorkflowStatus("draft")
  }

  const handleWorkflowUpdated = () => {
    if (sidebarRefreshRef.current) {
      console.log("[v0] Main: Triggering sidebar refresh after workflow update")
      sidebarRefreshRef.current()
    }
  }

  const handleSidebarRefreshReady = (refreshFn: () => void) => {
    sidebarRefreshRef.current = refreshFn
  }

  const handleSidebarRefreshNeeded = () => {
    if (sidebarRefreshRef.current) {
      console.log("[v0] Main: Sidebar refresh needed, triggering refresh")
      sidebarRefreshRef.current()
    }
  }

  const handleWorkflowGenerated = (workflowJson: string) => {
    console.log("[v0] Main: Received generated workflow JSON")
    setGeneratedWorkflowJson(workflowJson)
    setWorkflowStatus("generated")
  }

  const handleStatusChange = async (newStatus: WorkflowStatus) => {
    if (!currentWorkflow) return

    console.log("[v0] Main: Updating workflow status to:", newStatus)
    setWorkflowStatus(newStatus)

    try {
      const workflowStorage = WorkflowStorage.getInstance()
      await workflowStorage.updateWorkflowStatus(currentWorkflow.id, newStatus)

      handleWorkflowUpdated()
    } catch (error) {
      console.error("[v0] Main: Failed to update workflow status:", error)
    }
  }

  const handleDeploymentSuccess = async (deploymentResult: { n8nWorkflowId: string; message: string }) => {
    if (!currentWorkflow) return

    console.log("[v0] Main: Deployment successful, updating status to deployed")

    // Immediately update local state
    setWorkflowStatus("deployed")

    // Update current workflow with n8n workflow ID
    setCurrentWorkflow((prev) =>
      prev
        ? {
            ...prev,
            n8n_workflow_id: deploymentResult.n8nWorkflowId,
            status: "deployed" as const,
          }
        : null,
    )

    // Show success message to user
    console.log("[v0] Main: " + deploymentResult.message)

    // Refresh workflow data after a short delay to ensure database update completed
    setTimeout(async () => {
      await handleWorkflowRefresh()
    }, 1000)

    handleWorkflowUpdated()
  }

  const handleWorkflowRefresh = async () => {
    if (!currentWorkflow) return

    console.log("[v0] Main: Refreshing current workflow data")
    setIsSyncInProgress(true)

    try {
      const workflowStorage = WorkflowStorage.getInstance()
      const refreshedWorkflow = await workflowStorage.getWorkflow(currentWorkflow.id)

      if (refreshedWorkflow) {
        console.log("[v0] Main: Workflow refreshed successfully")
        const dbStatus = (refreshedWorkflow.status as WorkflowStatus) || "draft"
        console.log("[v0] Main: Database status:", dbStatus, "Local status:", workflowStatus)

        setCurrentWorkflow(refreshedWorkflow)

        console.log("[v0] Main: Updating status from database:", dbStatus)
        setWorkflowStatus(dbStatus)

        if (refreshedWorkflow.workflow_json) {
          console.log("[v0] Main: Loading stored workflow JSON")
          setGeneratedWorkflowJson(JSON.stringify(refreshedWorkflow.workflow_json, null, 2))
        }

        handleWorkflowUpdated()
      }
    } catch (error) {
      console.error("[v0] Main: Failed to refresh workflow:", error)
    } finally {
      setTimeout(() => {
        setIsSyncInProgress(false)
        console.log("[v0] Main: Sync operation completed, status protection disabled")
      }, 500)
    }
  }

  const handleAIBuilderClick = () => {
    const element = document.querySelector("[data-ai-builder]")
    element?.scrollIntoView({ behavior: "smooth" })
  }

  return (
    <div className="h-screen bg-slate-900 text-white flex flex-col">
      <Header
        onAIBuilderClick={handleAIBuilderClick}
        hasWorkflow={!!generatedWorkflowJson}
        workflowJson={generatedWorkflowJson}
        workflowStatus={workflowStatus}
        onStatusChange={handleStatusChange}
        onWorkflowRefresh={handleWorkflowRefresh}
        onDeploymentSuccess={handleDeploymentSuccess} // Added deployment success callback
        workflowId={currentWorkflow?.id}
        workflowName={currentWorkflow?.name}
        n8nWorkflowId={currentWorkflow?.n8n_workflow_id}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar
          onWorkflowSelect={handleWorkflowSelect}
          currentWorkflowId={currentWorkflow?.id}
          onWorkflowCreated={handleWorkflowCreated}
          onRefreshReady={handleSidebarRefreshReady}
        />

        <div className="flex-1" data-ai-builder>
          <AIConversationBuilder
            currentWorkflow={currentWorkflow}
            onWorkflowCreated={handleWorkflowCreated}
            onWorkflowUpdated={handleWorkflowUpdated}
            onSidebarRefreshNeeded={handleSidebarRefreshNeeded}
            onWorkflowGenerated={handleWorkflowGenerated}
            generatedWorkflowJson={generatedWorkflowJson} // Pass generatedWorkflowJson to AI conversation builder so it can display synced changes
          />
        </div>

        <RightPanel generatedWorkflowJson={generatedWorkflowJson} />
      </div>
    </div>
  )
}
