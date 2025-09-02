"use client"

import type React from "react"
import { useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Plus, Search, ChevronLeft, MoreHorizontal, Trash2 } from "lucide-react"
import { useState, useEffect } from "react"
import { workflowStorage, type WorkflowData } from "@/lib/workflow-storage"

interface SidebarProps {
  onWorkflowSelect?: (workflow: WorkflowData) => void
  currentWorkflowId?: string
  onWorkflowCreated?: (workflow: WorkflowData) => void
  onRefreshReady?: (refreshFn: () => void) => void
}

export default function Sidebar({
  onWorkflowSelect,
  currentWorkflowId,
  onWorkflowCreated,
  onRefreshReady,
}: SidebarProps) {
  const [workflows, setWorkflows] = useState<WorkflowData[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [workflowName, setWorkflowName] = useState("")
  const [workflowDescription, setWorkflowDescription] = useState("")
  const isLoadingRef = useRef(false)

  useEffect(() => {
    loadWorkflows()
  }, [])

  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(() => refreshWorkflows(false)) // Silent refresh for auto-save
    }
  }, [onRefreshReady])

  const loadWorkflows = async (showLoading = true) => {
    if (isLoadingRef.current) return

    isLoadingRef.current = true
    if (showLoading) {
      setIsLoading(true)
    }

    try {
      console.log("[v0] Sidebar: Loading workflows...")
      const data = await workflowStorage.getWorkflows()
      console.log("[v0] Sidebar: Loaded", data.length, "workflows")

      data.forEach((workflow, index) => {
        console.log(`[v0] Sidebar: Workflow ${index + 1} (${workflow.name}):`, {
          id: workflow.id,
          chat_history_length: workflow.chat_history?.length || 0,
          chat_history_sample: workflow.chat_history?.slice(0, 2) || [],
        })
      })

      setWorkflows(data)
    } catch (error) {
      console.error("[v0] Error loading workflows:", error)
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
      isLoadingRef.current = false
    }
  }

  const refreshWorkflows = async (showLoading = true) => {
    console.log("[v0] Sidebar: External refresh requested", showLoading ? "(with loading)" : "(silent)")
    await new Promise((resolve) => setTimeout(resolve, 100)) // Add small delay to ensure database has been updated before fetching
    await loadWorkflows(showLoading)
  }

  const handleDeleteWorkflow = async (workflowId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Are you sure you want to delete this workflow?")) {
      const success = await workflowStorage.deleteWorkflow(workflowId)
      if (success) {
        await loadWorkflows()
      }
    }
  }

  const handleCreateWorkflow = async () => {
    if (!workflowName.trim()) return

    try {
      const workflow = await workflowStorage.createWorkflow(
        workflowName.trim(),
        workflowDescription.trim() || undefined,
      )

      if (workflow) {
        setShowNameDialog(false)
        setWorkflowName("")
        setWorkflowDescription("")
        await loadWorkflows() // Refresh the list
        onWorkflowCreated?.(workflow) // Notify parent component
      }
    } catch (error) {
      console.error("[v0] Error creating workflow:", error)
    }
  }

  const filteredWorkflows = workflows.filter(
    (workflow) =>
      workflow.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      workflow.description?.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString()
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case "active":
        return "bg-green-500"
      case "completed":
        return "bg-blue-500"
      case "generated":
        return "bg-purple-500"
      case "deployed":
        return "bg-emerald-500"
      default:
        return "bg-red-500"
    }
  }

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "active":
        return "Active"
      case "completed":
        return "Done"
      case "generated":
        return "Generated"
      case "deployed":
        return "Deployed"
      default:
        return "Draft"
    }
  }

  const getN8nWorkflowUrl = (n8nWorkflowId: string, n8nInstanceUrl?: string) => {
    // Get n8n instance URL from localStorage or use default
    const instanceUrl = n8nInstanceUrl || localStorage.getItem("n8n_instance_url") || "https://app.n8n.cloud"
    return `${instanceUrl}/workflow/${n8nWorkflowId}`
  }

  return (
    <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col">
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white">Name Your Workflow</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="workflow-name" className="text-slate-300">
                Workflow Name
              </Label>
              <Input
                id="workflow-name"
                placeholder="e.g., Daily Twitter Bot"
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="workflow-description" className="text-slate-300">
                Description (optional)
              </Label>
              <Input
                id="workflow-description"
                placeholder="Brief description of what this workflow does"
                value={workflowDescription}
                onChange={(e) => setWorkflowDescription(e.target.value)}
                className="bg-slate-700 border-slate-600 text-white"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowNameDialog(false)
                setWorkflowName("")
                setWorkflowDescription("")
              }}
              className="border-slate-600 text-slate-300 hover:bg-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreateWorkflow}
              disabled={!workflowName.trim()}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Create Workflow
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="p-4 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-white">My Workflows</h2>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => setShowNameDialog(true)}
              title="Create new workflow"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
              <ChevronLeft className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Search workflows..."
            className="pl-9 bg-slate-700 border-slate-600 text-white placeholder-slate-400"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex-1 p-4 overflow-auto">
        {isLoading ? (
          <div className="text-center text-slate-400 py-8">
            <div className="animate-spin w-6 h-6 border-2 border-slate-600 border-t-slate-400 rounded-full mx-auto mb-2"></div>
            Loading workflows...
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="text-center text-slate-400 py-8">
            {searchQuery ? "No workflows found" : "No workflows yet"}
            <p className="text-xs mt-1">Start a conversation to create your first workflow</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredWorkflows.map((workflow) => (
              <div
                key={workflow.id}
                className={`bg-slate-700 rounded-lg p-3 border cursor-pointer transition-colors hover:bg-slate-600 ${
                  currentWorkflowId === workflow.id ? "border-blue-500 bg-slate-600" : "border-slate-600"
                }`}
                onClick={() => {
                  console.log("[v0] Sidebar: Selecting workflow:", {
                    id: workflow.id,
                    name: workflow.name,
                    chat_history_length: workflow.chat_history?.length || 0,
                  })
                  onWorkflowSelect?.(workflow)
                }}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium text-white text-sm truncate">{workflow.name}</h3>
                    {workflow.description && <p className="text-xs text-slate-400 truncate">{workflow.description}</p>}
                    <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                      <span>{workflow.chat_history.length} messages</span>
                      {workflow.n8n_workflow_id && (
                        <>
                          <span>•</span>
                          <a
                            href={getN8nWorkflowUrl(workflow.n8n_workflow_id)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300 underline"
                            onClick={(e) => e.stopPropagation()}
                            title="Open in n8n"
                          >
                            {workflow.n8n_workflow_id}
                          </a>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 hover:bg-red-600"
                      onClick={(e) => handleDeleteWorkflow(workflow.id, e)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className="flex items-center gap-1">
                    <div className={`w-2 h-2 rounded-full ${getStatusColor(workflow.status)}`}></div>
                    {getStatusLabel(workflow.status)}
                  </span>
                  <span className="text-slate-400">{formatDate(workflow.updated_at)}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
