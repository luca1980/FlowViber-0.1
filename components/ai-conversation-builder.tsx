"use client"

import type React from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RefreshCw, Sparkles, Send, User, Bot, AlertCircle, Brain, X, Wand2 } from "lucide-react"
import { useState, useEffect, useRef, useCallback } from "react"
import { aiService } from "@/lib/ai-service"
import { workflowStorage, type WorkflowData } from "@/lib/workflow-storage"
import type { ConversationState } from "@/lib/prompting-system"
import WorkflowStorage from "@/lib/workflow-storage" // Import WorkflowStorage class

interface Message {
  id: string
  content: string
  sender: "user" | "ai"
  timestamp: Date
  isTyping?: boolean
  provider?: string
  error?: boolean
  reasoning?: string
}

interface AIConversationBuilderProps {
  currentWorkflow?: WorkflowData | null
  onWorkflowCreated?: (workflow: WorkflowData) => void
  onWorkflowUpdated?: () => void
  onSidebarRefreshNeeded?: () => void
  onWorkflowGenerated?: (workflowJson: string) => void
  generatedWorkflowJson?: string | null
}

export default function AIConversationBuilder({
  currentWorkflow,
  onWorkflowCreated,
  onWorkflowUpdated,
  onSidebarRefreshNeeded,
  onWorkflowGenerated,
  generatedWorkflowJson,
}: AIConversationBuilderProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "initial",
      content:
        "Hi! I'm your n8n workflow expert. Tell me what you want to automate, and I'll help you build the perfect workflow. What process would you like to automate today?",
      sender: "ai",
      timestamp: new Date(),
    },
  ])
  const [inputValue, setInputValue] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const [currentProvider, setCurrentProvider] = useState<string>("")
  const [currentModel, setCurrentModel] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [conversationState, setConversationState] = useState<ConversationState | null>(null)
  const [currentReasoning, setCurrentReasoning] = useState<string>("")
  const [showReasoning, setShowReasoning] = useState<boolean>(false)
  const [showNameDialog, setShowNameDialog] = useState(false)
  const [workflowName, setWorkflowName] = useState("")
  const [workflowDescription, setWorkflowDescription] = useState("")
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | null>(null)
  const [hasStartedTyping, setHasStartedTyping] = useState(false)
  const [notification, setNotification] = useState<{
    show: boolean
    type: "credits" | "overload" | "fallback"
    title: string
    message: string
    errorCode?: string
  }>({
    show: false,
    type: "fallback",
    title: "",
    message: "",
  })
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null) // Added ref for messages container
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout>()
  const lastSavedHashRef = useRef<string>("")
  const isTransitioningRef = useRef<boolean>(false)
  const workflowStateRef = useRef<{ workflowId: string | null; messages: Message[] }>({
    workflowId: null,
    messages: [],
  })

  const [showGenerateButton, setShowGenerateButton] = useState(false)
  const [isGeneratingWorkflow, setIsGeneratingWorkflow] = useState(false)
  const [workflowGenerated, setWorkflowGenerated] = useState(false)

  useEffect(() => {
    workflowStateRef.current = { workflowId: currentWorkflowId, messages }
  }, [currentWorkflowId, messages])

  const loadWorkflowData = useCallback((workflow: WorkflowData | null) => {
    console.log("[v0] ConversationBuilder: Loading workflow data:", {
      hasWorkflow: !!workflow,
      workflowId: workflow?.id,
      workflowName: workflow?.name,
      chat_history_length: workflow?.chat_history?.length || 0,
    })

    isTransitioningRef.current = true

    if (workflow) {
      const loadedMessages = workflow.chat_history.map((msg) => ({
        ...msg,
        timestamp: new Date(msg.timestamp),
      }))

      const messagesToSet =
        loadedMessages.length > 0
          ? loadedMessages
          : [
              {
                id: "initial",
                content:
                  "Hi! I'm your n8n workflow expert. Tell me what you want to automate, and I'll help you build the perfect workflow. What process would you like to automate today?",
                sender: "ai" as const,
                timestamp: new Date(),
              },
            ]

      const messagesHash = JSON.stringify(messagesToSet.map((m) => m.id + m.content + m.sender))

      setCurrentWorkflowId(workflow.id)
      setMessages(messagesToSet)
      setHasStartedTyping(true)
      lastSavedHashRef.current = messagesHash

      // Reset workflow generation state when loading a workflow
      setWorkflowGenerated(false)
      setShowGenerateButton(false)
    } else {
      const initialMessage = {
        id: "initial-" + Date.now(),
        content:
          "Hi! I'm your n8n workflow expert. Tell me what you want to automate, and I'll help you build the perfect workflow. What process would you like to automate today?",
        sender: "ai" as const,
        timestamp: new Date(),
      }

      const messagesHash = JSON.stringify([initialMessage].map((m) => m.id + m.content + m.sender))

      setCurrentWorkflowId(null)
      setMessages([initialMessage])
      setHasStartedTyping(false)
      lastSavedHashRef.current = messagesHash
      setWorkflowGenerated(false)
      setShowGenerateButton(false)
    }

    setTimeout(() => {
      isTransitioningRef.current = false
      console.log("[v0] Workflow transition complete, auto-save re-enabled")
    }, 500)
  }, [])

  useEffect(() => {
    loadWorkflowData(currentWorkflow)
  }, [currentWorkflow, loadWorkflowData])

  useEffect(() => {
    if (isTransitioningRef.current) {
      console.log("[v0] Auto-save skipped - workflow transition in progress")
      return
    }

    if (!currentWorkflowId || messages.length <= 1) {
      console.log("[v0] Auto-save skipped - no workflow or insufficient messages")
      return
    }

    const currentState = workflowStateRef.current
    if (currentState.workflowId !== currentWorkflowId) {
      console.log("[v0] Auto-save skipped - state inconsistency detected")
      return
    }

    const messagesHash = JSON.stringify(messages.map((m) => m.id + m.content + m.sender))

    if (messagesHash === lastSavedHashRef.current) {
      console.log("[v0] Auto-save skipped - messages unchanged since last save")
      return
    }

    console.log("[v0] Auto-save: Messages changed, scheduling save in 3000ms")

    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current)
    }

    autoSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const latestState = workflowStateRef.current
        if (latestState.workflowId !== currentWorkflowId || isTransitioningRef.current) {
          console.log("[v0] Auto-save cancelled - state changed during debounce")
          return
        }

        const currentHash = JSON.stringify(messages.map((m) => m.id + m.content + m.sender))
        if (currentHash !== messagesHash) {
          console.log("[v0] Auto-save cancelled - messages changed during debounce")
          return
        }

        console.log("[v0] Auto-save: Executing save for workflow:", currentWorkflowId)

        const chatHistory = messages.map((msg) => ({
          id: msg.id,
          content: msg.content,
          sender: msg.sender,
          timestamp: msg.timestamp.toISOString(),
          provider: msg.provider,
          error: msg.error,
        }))

        console.log("[v0] Auto-save: Saving", chatHistory.length, "messages")
        const success = await workflowStorage.updateWorkflowChatHistory(currentWorkflowId, chatHistory)

        if (success) {
          console.log("[v0] Auto-save: Successfully saved chat history")
          lastSavedHashRef.current = messagesHash
          if (onSidebarRefreshNeeded) {
            console.log("[v0] Auto-save: Triggering sidebar refresh")
            onSidebarRefreshNeeded()
          }
        } else {
          console.error("[v0] Auto-save: Failed to save chat history")
        }
      } catch (error) {
        console.error("[v0] Auto-save error:", error)
      }
    }, 3000)

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current)
      }
    }
  }, [messages, currentWorkflowId, onSidebarRefreshNeeded])

  useEffect(() => {
    if (messagesContainerRef.current && messagesEndRef.current) {
      const container = messagesContainerRef.current
      const element = messagesEndRef.current

      // Scroll within the container only
      container.scrollTo({
        top: element.offsetTop,
        behavior: "smooth",
      })
    }
  }, [messages, isTyping])

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification((prev) => ({ ...prev, show: false }))
      }, 6000)
      return () => clearTimeout(timer)
    }
  }, [notification.show])

  useEffect(() => {
    if (generatedWorkflowJson) {
      console.log("[v0] Synced workflow JSON received:", generatedWorkflowJson)
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 2).toString(),
          content: "🎉 Workflow JSON synced successfully!",
          sender: "ai",
          timestamp: new Date(),
          provider: currentProvider,
        },
      ])
      setWorkflowGenerated(true)
    }
  }, [generatedWorkflowJson])

  const handleInputChange = (value: string) => {
    setInputValue(value)

    if (!hasStartedTyping && !currentWorkflowId && value.trim().length > 0) {
      setShowNameDialog(true)
    }
  }

  const handleCreateWorkflow = async () => {
    if (!workflowName.trim()) return

    console.log("[v0] Creating workflow with name:", workflowName.trim())
    console.log("[v0] Description:", workflowDescription.trim() || "none")

    try {
      const workflow = await workflowStorage.createWorkflow(
        workflowName.trim(),
        workflowDescription.trim() || undefined,
      )
      console.log("[v0] Workflow creation result:", workflow)

      if (workflow) {
        console.log("[v0] Workflow created successfully with ID:", workflow.id)
        setCurrentWorkflowId(workflow.id)
        setHasStartedTyping(true)
        setShowNameDialog(false)
        setWorkflowName("")
        setWorkflowDescription("")
        onWorkflowCreated?.(workflow)
      } else {
        console.error("[v0] Workflow creation returned null")
        setError("Failed to create workflow. Please try again.")
      }
    } catch (error) {
      console.error("[v0] Error in handleCreateWorkflow:", error)
      setError("Failed to create workflow. Please check the console for details.")
    }
  }

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      content: inputValue.trim(),
      sender: "user",
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInputValue("")
    setIsLoading(true)
    setIsTyping(true)
    setError("")

    setShowReasoning(true)
    setCurrentReasoning("Analyzing your n8n workflow requirements...")

    try {
      const conversationHistory = messages.map((msg) => ({
        role: msg.sender === "user" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      }))

      const aiMessages = [
        ...conversationHistory,
        {
          role: "user" as const,
          content: userMessage.content,
        },
      ]

      setCurrentReasoning("Identifying n8n nodes and connections needed for your automation...")

      setTimeout(() => {
        setCurrentReasoning("Determining trigger type and data flow...")
      }, 1000)

      console.log("[v0] Sending messages to AI service:", aiMessages.length)
      const response = await aiService.generateResponse(aiMessages, conversationState)
      console.log("[v0] AI response received from:", response.provider)

      if (response.fallback && response.errorCode && response.showNotification !== false && !response.silentFallback) {
        let notificationConfig = {
          show: true,
          type: "fallback" as const,
          title: "Provider Switched",
          message: "Switched to backup provider",
          errorCode: response.errorCode,
        }

        switch (response.errorCode) {
          case "CREDITS_LOW":
            notificationConfig = {
              show: true,
              type: "credits",
              title: "Claude Credits Exhausted",
              message: "Primary API is out of credits. Now using OpenAI for this session.",
              errorCode: response.errorCode,
            }
            break
          case "RATE_LIMIT":
            notificationConfig = {
              show: true,
              type: "overload",
              title: "Claude Rate Limited",
              message: "Primary API rate limit exceeded. Now using OpenAI for this session.",
              errorCode: response.errorCode,
            }
            break
          default:
            if (response.fallbackReason?.includes("overloaded")) {
              notificationConfig = {
                show: true,
                type: "overload",
                title: "Claude Overloaded",
                message: "Primary API is overloaded. Now using OpenAI for this session.",
                errorCode: response.errorCode,
              }
            }
        }

        setNotification(notificationConfig)
      }

      setCurrentProvider(response.provider)
      setCurrentModel(response.provider === "claude" ? "Claude Sonnet 4" : "GPT-4")

      if (response.conversationState) {
        setConversationState(response.conversationState)
        console.log(
          "[v0] Conversation state updated - Phase:",
          response.conversationState.phase,
          "Completeness:",
          response.conversationState.completeness,
        )
      }

      setShowReasoning(false)
      setCurrentReasoning("")

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: response.content,
        sender: "ai",
        timestamp: new Date(),
        provider: response.provider,
      }

      setMessages((prev) => [...prev, aiMessage])

      const responseContent = response.content.toLowerCase()
      const hasWorkflowSummary =
        responseContent.includes("workflow summary") ||
        responseContent.includes("here's the n8n workflow") ||
        responseContent.includes("final summary") ||
        responseContent.includes("summary of your workflow") ||
        responseContent.includes("workflow will scan") ||
        responseContent.includes("workflow that")
      const hasComponents =
        responseContent.includes("n8n components") ||
        responseContent.includes("key components") ||
        responseContent.includes("**key components") ||
        responseContent.includes("components:**") ||
        responseContent.includes("trigger**") ||
        responseContent.includes("processing**") ||
        responseContent.includes("output**")
      const hasConfirmation =
        responseContent.includes("does this capture") ||
        responseContent.includes("anything else") ||
        responseContent.includes("ready to generate") ||
        responseContent.includes("click the generate workflow button") ||
        responseContent.includes("you can now click") ||
        responseContent.includes("proceed with generating")
      const hasGenerateInstruction =
        responseContent.includes("[generate workflow]") ||
        responseContent.includes("click on the button below") ||
        responseContent.includes("click the button") ||
        responseContent.includes("generate your workflow") ||
        responseContent.includes("create your n8n workflow") ||
        responseContent.includes("let's create your n8n workflow") ||
        responseContent.includes("click the generate workflow button")

      // Check conversation state completeness
      const userConfirmedInPreviousMessage =
        messages.length > 1 &&
        messages[messages.length - 2]?.sender === "user" &&
        (messages[messages.length - 2]?.content.toLowerCase().includes("yes") ||
          messages[messages.length - 2]?.content.toLowerCase().includes("looks good") ||
          messages[messages.length - 2]?.content.toLowerCase().includes("that's correct") ||
          messages[messages.length - 2]?.content.toLowerCase().includes("let's generate") ||
          messages[messages.length - 2]?.content.toLowerCase().includes("looks great"))

      const isReady =
        !response.conversationState || response.conversationState.completeness >= 70 || userConfirmedInPreviousMessage

      console.log("[v0] Generate button detection:")
      console.log("[v0] - hasWorkflowSummary:", hasWorkflowSummary)
      console.log("[v0] - hasComponents:", hasComponents)
      console.log("[v0] - hasConfirmation:", hasConfirmation)
      console.log("[v0] - hasGenerateInstruction:", hasGenerateInstruction)
      console.log("[v0] - userConfirmedInPreviousMessage:", userConfirmedInPreviousMessage)
      console.log("[v0] - isReady:", isReady)
      console.log("[v0] - completeness:", response.conversationState?.completeness || "no state")
      console.log("[v0] - response preview:", responseContent.substring(0, 200))

      if (
        hasGenerateInstruction ||
        ((hasWorkflowSummary || hasComponents) && (hasConfirmation || userConfirmedInPreviousMessage) && isReady)
      ) {
        console.log("[v0] Generate button conditions met - showing button")
        setShowGenerateButton(true)
      } else {
        console.log("[v0] Generate button conditions NOT met")
        setShowGenerateButton(false)
      }
    } catch (error) {
      console.error("[v0] AI service error:", error)
      const errorMessage = error instanceof Error ? error.message : "An unexpected error occurred"
      setError(errorMessage)

      setShowReasoning(false)
      setCurrentReasoning("")

      const aiMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `I apologize, but I'm having trouble connecting to the AI service right now. ${errorMessage}. Please try again in a moment.`,
        sender: "ai",
        timestamp: new Date(),
        error: true,
      }

      setMessages((prev) => [...prev, aiMessage])
    } finally {
      setIsLoading(false)
      setIsTyping(false)
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
    }
  }

  const handleGenerateWorkflow = async () => {
    setIsGeneratingWorkflow(true)
    setShowGenerateButton(false)

    try {
      const conversationHistory = messages.map((msg) => ({
        role: msg.sender === "user" ? ("user" as const) : ("assistant" as const),
        content: msg.content,
      }))

      console.log("[v0] Generating workflow JSON...")

      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: conversationHistory,
          isWorkflowGeneration: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        console.error("[v0] API response error:", error)
        throw new Error(error.error || "Failed to generate workflow")
      }

      const data = await response.json()
      console.log("[v0] Workflow generation response received")
      console.log("[v0] Response provider:", data.provider)
      console.log("[v0] Response preview:", data.content.substring(0, 200))

      let workflowJson = data.content.trim()

      // Remove any markdown formatting
      workflowJson = workflowJson.replace(/```(?:json)?\s*/g, "").replace(/\s*```/g, "")

      // Remove any explanatory text before or after JSON
      const jsonStart = workflowJson.indexOf("{")
      const jsonEnd = workflowJson.lastIndexOf("}")

      if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
        console.error("[v0] No valid JSON structure found in response")
        console.error("[v0] Response content:", workflowJson)

        if (
          workflowJson.toLowerCase().includes("sorry") ||
          workflowJson.toLowerCase().includes("can't generate") ||
          workflowJson.toLowerCase().includes("unable to")
        ) {
          throw new Error("AI provided explanation instead of JSON. The system prompt may need adjustment.")
        }

        throw new Error("AI did not generate valid JSON structure. Please try again.")
      }

      workflowJson = workflowJson.substring(jsonStart, jsonEnd + 1)
      console.log("[v0] Extracted JSON length:", workflowJson.length)

      try {
        const parsed = JSON.parse(workflowJson)

        if (!parsed.nodes || !Array.isArray(parsed.nodes)) {
          throw new Error("Generated workflow is missing required 'nodes' array")
        }

        if (parsed.nodes.length === 0) {
          throw new Error("Generated workflow has no nodes")
        }

        // Check for basic n8n node structure
        const invalidNodes = parsed.nodes.filter((node: any) => !node.name || !node.type)
        if (invalidNodes.length > 0) {
          throw new Error(`Generated workflow has ${invalidNodes.length} invalid nodes missing name or type`)
        }

        console.log("[v0] Valid n8n workflow JSON generated")
        console.log("[v0] Workflow contains", parsed.nodes.length, "nodes")
        console.log("[v0] Workflow has connections:", !!parsed.connections)
        console.log("[v0] Node types:", parsed.nodes.map((n: any) => n.type).join(", "))

        if (currentWorkflowId) {
          try {
            const workflowStorageInstance = WorkflowStorage.getInstance()
            await workflowStorageInstance.updateWorkflowJsonAndStatus(currentWorkflowId, parsed, "generated")
            console.log("[v0] Workflow JSON and status saved to database")

            // Trigger sidebar refresh to show updated status
            if (onWorkflowUpdated) {
              onWorkflowUpdated()
            }
          } catch (dbError) {
            console.error("[v0] Failed to save workflow to database:", dbError)
            // Don't fail the entire generation for database errors
          }
        }

        // Send to right panel
        if (onWorkflowGenerated) {
          console.log("[v0] Calling onWorkflowGenerated with validated JSON")
          onWorkflowGenerated(workflowJson)
        } else {
          console.error("[v0] onWorkflowGenerated callback not defined!")
        }
      } catch (parseError) {
        console.error("[v0] Generated content is not valid JSON:", parseError)
        console.error("[v0] Generated content:", workflowJson.substring(0, 500))

        let errorMessage = "Generated workflow is not valid JSON"
        if (parseError instanceof Error) {
          if (parseError.message.includes("Unexpected token")) {
            errorMessage = "AI generated malformed JSON. Please try again."
          } else if (parseError.message.includes("nodes")) {
            errorMessage = parseError.message
          } else {
            errorMessage = `JSON parsing failed: ${parseError.message}`
          }
        }
        throw new Error(errorMessage)
      }

      setWorkflowGenerated(true)

      // Add success message to conversation
      setTimeout(() => {
        const celebrationMessage: Message = {
          id: (Date.now() + 2).toString(),
          content:
            "🎉 Workflow generated successfully! You can view the complete n8n workflow JSON in the JSON tab on the right. Copy it and import it directly into your n8n instance.",
          sender: "ai",
          timestamp: new Date(),
          provider: data.provider,
        }
        setMessages((prev) => [...prev, celebrationMessage])
        console.log("[v0] Celebration message added to conversation")

        setTimeout(() => {
          textareaRef.current?.focus()
        }, 100)
      }, 1000)
    } catch (error) {
      console.error("[v0] Workflow generation error:", error)

      let errorMessage = "Failed to generate workflow. Please try again."
      if (error instanceof Error) {
        if (error.message.includes("AI provided explanation")) {
          errorMessage =
            "AI provided explanation instead of JSON. Please try rephrasing your requirements and try again."
        } else if (error.message.includes("system prompt")) {
          errorMessage = "System configuration issue. Please try again or contact support."
        } else if (error.message.includes("JSON")) {
          errorMessage = `JSON Error: ${error.message}`
        } else if (error.message.includes("nodes")) {
          errorMessage = `Workflow Error: ${error.message}`
        } else {
          errorMessage = error.message
        }
      }

      setError(errorMessage)
      setShowGenerateButton(true) // Re-show button on error

      const errorMessage_ai: Message = {
        id: (Date.now() + 3).toString(),
        content: `❌ Workflow generation failed: ${errorMessage}\n\nPlease ensure your requirements are clear and try again. You may need to provide more specific details about your automation needs.`,
        sender: "ai",
        timestamp: new Date(),
        error: true,
      }
      setMessages((prev) => [...prev, errorMessage_ai])
    } finally {
      setIsGeneratingWorkflow(false)
      setTimeout(() => {
        textareaRef.current?.focus()
      }, 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleClearConversation = () => {
    setConversationState(null)
    setShowReasoning(false)
    setCurrentReasoning("")
    setWorkflowGenerated(false)
    setShowGenerateButton(false)
    loadWorkflowData(null)
  }

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
  }

  const getProviderInfo = () => {
    if (!currentProvider) return { name: "AI", color: "bg-slate-600" }

    switch (currentProvider.toLowerCase()) {
      case "claude":
        return { name: "Claude Sonnet 4", color: "bg-orange-600" }
      case "openai":
        return { name: "GPT-4", color: "bg-green-600" }
      default:
        return { name: currentProvider, color: "bg-blue-600" }
    }
  }

  const getNotificationStyle = () => {
    switch (notification.type) {
      case "credits":
        return {
          bg: "bg-red-900/90",
          border: "border-red-700",
          icon: "text-red-400",
          text: "text-red-100",
          subtext: "text-red-200",
        }
      case "overload":
        return {
          bg: "bg-orange-900/90",
          border: "border-orange-700",
          icon: "text-orange-400",
          text: "text-orange-100",
          subtext: "text-orange-200",
        }
      default:
        return {
          bg: "bg-blue-900/90",
          border: "border-blue-700",
          icon: "text-blue-400",
          text: "text-blue-100",
          subtext: "text-blue-200",
        }
    }
  }

  const providerInfo = getProviderInfo()
  const notificationStyle = getNotificationStyle()

  return (
    <div className="flex-1 bg-slate-900 flex flex-col relative h-full">
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
                placeholder="e.g., Daily Email Automation"
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
                setInputValue("")
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

      {notification.show && (
        <div
          className={`absolute top-4 right-4 z-50 ${notificationStyle.bg} backdrop-blur-sm border ${notificationStyle.border} rounded-lg p-4 shadow-lg max-w-sm`}
        >
          <div className="flex items-start gap-3">
            <AlertCircle className={`w-5 h-5 ${notificationStyle.icon} mt-0.5 flex-shrink-0`} />
            <div className="flex-1">
              <p className={`text-sm ${notificationStyle.text} font-medium`}>{notification.title}</p>
              <p className={`text-xs ${notificationStyle.subtext} mt-1`}>{notification.message}</p>
              {notification.errorCode && (
                <p className={`text-xs ${notificationStyle.subtext} mt-1 font-mono opacity-75`}>
                  Error: {notification.errorCode}
                </p>
              )}
            </div>
            <button
              onClick={() => setNotification((prev) => ({ ...prev, show: false }))}
              className={`${notificationStyle.icon} hover:opacity-75 transition-opacity`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="border-b border-slate-700 p-4 flex-shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <h1 className="font-semibold text-white">AI Conversation Builder</h1>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${providerInfo.color}`}></div>
                <p className="text-xs text-slate-400">
                  Powered by {providerInfo.name}
                  {conversationState &&
                    ` • ${conversationState.phase} phase (${conversationState.completeness}% complete)`}
                  {error && " • Connection Issues"}
                </p>
              </div>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={handleClearConversation}
            title="Clear conversation"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
        {error && (
          <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded-lg flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400" />
            <p className="text-xs text-red-400">AI service temporarily unavailable</p>
          </div>
        )}
      </div>

      <div className="flex-1 p-4 overflow-auto min-h-0" ref={messagesContainerRef}>
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex gap-3 ${message.sender === "user" ? "justify-end" : "justify-start"}`}
            >
              {message.sender === "ai" && (
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    message.error ? "bg-red-600" : "bg-blue-600"
                  }`}
                >
                  {message.error ? (
                    <AlertCircle className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4 text-white" />
                  )}
                </div>
              )}

              <div className={`max-w-[80%] ${message.sender === "user" ? "order-first" : ""}`}>
                <div
                  className={`rounded-lg p-3 ${
                    message.sender === "user"
                      ? "bg-blue-600 text-white ml-auto"
                      : message.error
                        ? "bg-red-900/20 border border-red-800 text-red-100"
                        : "bg-slate-800 text-slate-100"
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                </div>
                <p
                  className={`text-xs text-slate-400 mt-1 flex items-center gap-1 ${
                    message.sender === "user" ? "text-right justify-end" : "text-left justify-start"
                  }`}
                >
                  {formatTime(message.timestamp)}
                  {message.provider && (
                    <span className="text-slate-500">
                      •{" "}
                      {message.provider === "claude"
                        ? "Claude"
                        : message.provider === "openai"
                          ? "GPT-4"
                          : message.provider}
                    </span>
                  )}
                </p>
              </div>

              {message.sender === "user" && (
                <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                  <User className="w-4 h-4 text-white" />
                </div>
              )}
            </div>
          ))}

          {showGenerateButton && !isGeneratingWorkflow && !workflowGenerated && (
            <div className="flex justify-center my-6">
              <Button
                onClick={handleGenerateWorkflow}
                className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-6 py-3 rounded-lg shadow-lg transform hover:scale-105 transition-all duration-200"
                size="lg"
              >
                <Wand2 className="w-5 h-5 mr-2" />
                Generate n8n Workflow
              </Button>
            </div>
          )}

          {isGeneratingWorkflow && (
            <div className="flex justify-center my-6">
              <div className="bg-slate-800 border border-slate-600 rounded-lg p-6 text-center">
                <div className="flex items-center justify-center gap-3 mb-3">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-slate-300 font-medium">Generating n8n Workflow...</span>
                </div>
                <p className="text-sm text-slate-400">Creating your workflow JSON configuration</p>
              </div>
            </div>
          )}

          {showReasoning && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 bg-slate-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Brain className="w-4 h-4 text-white" />
              </div>
              <div className="bg-slate-800/50 border border-slate-600 rounded-lg p-3 max-w-[80%]">
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse"></div>
                    <div
                      className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse"
                      style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                      className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-pulse"
                      style={{ animationDelay: "0.4s" }}
                    ></div>
                  </div>
                  <span className="text-xs text-slate-400 font-medium">AI Reasoning</span>
                </div>
                <p className="text-sm text-slate-300 italic">{currentReasoning}</p>
              </div>
            </div>
          )}

          {isTyping && !showReasoning && (
            <div className="flex gap-3 justify-start">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="bg-slate-800 rounded-lg p-3">
                <div className="flex gap-1">
                  <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"></div>
                  <div
                    className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.1s" }}
                  ></div>
                  <div
                    className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: "0.2s" }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-slate-700 p-4 flex-shrink-0 bg-slate-900">
        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            placeholder="Describe your n8n automation needs..."
            className="flex-1 bg-slate-800 border-slate-600 text-white placeholder-slate-400 resize-none min-h-[40px] max-h-[120px]"
            value={inputValue}
            onChange={(e) => handleInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
            rows={1}
          />
          <Button
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            onClick={handleSendMessage}
            disabled={!inputValue.trim() || isLoading}
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">
          Press Enter to send, Shift+Enter for new line
          {messages.length > 1 && ` • ${messages.length - 1} messages`}
          {currentModel && ` • ${currentModel}`}
          {currentWorkflow && ` • ${currentWorkflow.name}`}
        </p>
      </div>
    </div>
  )
}
