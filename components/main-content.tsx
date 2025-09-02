"use client"

import AIConversationBuilder from "./ai-conversation-builder"
import type { WorkflowData } from "@/lib/workflow-storage"

interface MainContentProps {
  currentWorkflow?: WorkflowData | null
  onWorkflowCreated?: (workflow: WorkflowData) => void
  onWorkflowUpdated?: () => void
  onSidebarRefreshNeeded?: () => void
  onWorkflowGenerated?: (workflowJson: string) => void
}

export default function MainContent({
  currentWorkflow,
  onWorkflowCreated,
  onWorkflowUpdated,
  onSidebarRefreshNeeded,
  onWorkflowGenerated,
}: MainContentProps) {
  return (
    <AIConversationBuilder
      currentWorkflow={currentWorkflow}
      onWorkflowCreated={onWorkflowCreated}
      onWorkflowUpdated={onWorkflowUpdated}
      onSidebarRefreshNeeded={onSidebarRefreshNeeded}
      onWorkflowGenerated={onWorkflowGenerated}
    />
  )
}
