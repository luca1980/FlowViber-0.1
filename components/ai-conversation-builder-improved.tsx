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
}

export default function AIConversationBuilder({
  currentWorkflow,
  onWorkflowCreated,
  onWorkflowUpdated,
  onSidebarRefreshNeeded,
  onWorkflowGenerated,
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
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  useEffect(() => {
    if (notification.show) {
      const timer = setTimeout(() => {
        setNotification((prev) => ({ ...prev, show: false }))
      }, 6000)
      return () => clearTimeout(timer)
    }
  }, [notification.show])

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

      // Improved detection for when to show generate button
      const responseContent = response.content.toLowerCase()
      const hasWorkflowSummary =
        responseContent.includes("workflow summary") || responseContent.includes("here's the n8n workflow")
      const hasComponents = responseContent.includes("n8n components") || responseContent.includes("key components")
      const hasConfirmation =
        responseContent.includes("does this capture") ||
        responseContent.includes("anything else") ||
        responseContent.includes("ready to generate")

      // Check conversation state completeness
      const isReady = response.conversationState && response.conversationState.completeness >= 80

      if ((hasWorkflowSummary || hasComponents) && hasConfirmation && isReady) {
        console.log("[v0] Generate button conditions met - ready to generate workflow")
        setShowGenerateButton(true)
      } else {
        console.log("[v0] Generate button conditions NOT met")
        console.log("[v0] Debug - hasWorkflowSummary:", hasWorkflowSummary)
        console.log("[v0] Debug - hasComponents:", hasComponents)
        console.log("[v0] Debug - hasConfirmation:", hasConfirmation)
        console.log("[v0] Debug - isReady:", isReady)
        console.log("[v0] Debug - completeness:", response.conversationState?.completeness)
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

      // Add a clear instruction for JSON generation
      const workflowPrompt = [
        ...conversationHistory,
        {
          role: "user" as const,
          content: "Generate the complete n8n workflow JSON now.",
        },
      ]

      console.log("[v0] Generating workflow JSON...")

      // Call the API with isWorkflowGeneration flag
      const response = await fetch("/api/ai-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: workflowPrompt,
          isWorkflowGeneration: true,
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || "Failed to generate workflow")
      }

      const data = await response.json()
      console.log("[v0] Workflow generation response received")

      let workflowJson = data.content.trim()

      // Clean up the JSON
      workflowJson = workflowJson.replace(/```(?:json)?\s*/g, "").replace(/\s*```/g, "")

      const jsonStart = workflowJson.indexOf("{")
      const jsonEnd = workflowJson.lastIndexOf("}")
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        workflowJson = workflowJson.substring(jsonStart, jsonEnd + 1)
      }

      // Validate JSON
      try {
        const parsed = JSON.parse(workflowJson)
        console.log("[v0] Valid JSON generated, sending to right panel")
        console.log("[v0] Generated workflow has", parsed.nodes?.length || 0, "nodes")

        // Send to right panel
        if (onWorkflowGenerated) {
          console.log("[v0] Calling onWorkflowGenerated with JSON")
          onWorkflowGenerated(workflowJson)
        } else {
          console.error("[v0] onWorkflowGenerated callback not defined!")
        }
      } catch (parseError) {
        console.error("[v0] Generated content is not valid JSON:", parseError)
        console.error("[v0] Generated content:", workflowJson.substring(0, 500))
        throw new Error("Generated workflow is not valid JSON")
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
      }, 1000)
    } catch (error) {
      console.error("[v0] Workflow generation error:", error)
      setError("Failed to generate workflow. Please try again.")
      setShowGenerateButton(true) // Re-show button on error
    } finally {
      setIsGeneratingWorkflow(false)
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

  const providerInfo = getProviderInfo()

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

  const notificationStyle = getNotificationStyle()

  return (
    <div className="flex-1 bg-slate-900 flex flex-col relative">
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

      <div className="border-b border-slate-700 p-4">
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

      <div className="flex-1 p-4 overflow-auto">
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

      <div className="border-t border-slate-700 p-4">
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
