export interface WorkflowRequirement {
  category: "scope" | "triggers" | "resources" | "inputs" | "destinations" | "errors"
  question: string
  answered: boolean
  answer?: string
  priority: "high" | "medium" | "low"
}

export interface ConversationState {
  phase: "discovery" | "validation" | "generation" | "complete"
  requirements: WorkflowRequirement[]
  completeness: number
  currentFocus?: string
}

export class AdvancedPromptingSystem {
  private static instance: AdvancedPromptingSystem

  static getInstance(): AdvancedPromptingSystem {
    if (!AdvancedPromptingSystem.instance) {
      AdvancedPromptingSystem.instance = new AdvancedPromptingSystem()
    }
    return AdvancedPromptingSystem.instance
  }

  generateSystemPrompt(conversationState: ConversationState): string {
    return `You are an expert n8n workflow automation consultant with deep knowledge of workflow design, API integrations, and business process automation.

Your primary goal is to gather comprehensive workflow requirements through natural conversation, then provide a detailed summary for user confirmation.

## Workflow Generation Process

1. Gather requirements step by step through natural conversation
2. Once ~80% of requirements are collected, provide a comprehensive summary
3. Ask for final confirmation: "Does this capture everything, or is there anything else we should consider?"
4. When the user confirms, acknowledge their confirmation and indicate readiness to generate the workflow

## IMPORTANT: Never generate JSON directly in your responses. JSON generation happens separately when the user clicks the Generate Workflow button.

## Summary Format

When requirements are complete, summarize like this:

**Workflow Summary:**
[Detailed description of the automation]

**Key Components:**
1. **Trigger**: [How the workflow starts]
2. **Processing**: [Data handling steps]  
3. **Output**: [Destination and format of results]
4. **Error Handling**: [Failure behavior and notifications]

Then ask: "Does this capture everything, or is there anything else we should consider?"

## After User Confirmation

When the user confirms the summary (with responses like "yes", "looks good", "that's correct", "let's generate it"), respond with:
"Perfect! I have all the information needed to create your n8n workflow. You can now click the Generate Workflow button to create the complete JSON configuration."

## Conversation Principles

- **One question at a time** — never multiple or compound questions
- Build requirements progressively and confirm before moving forward
- Interpret new info as part of the current workflow, unless explicitly stated otherwise
- Keep focus on the single workflow being built
- Avoid repetition, filler, or unnecessary confirmations
- End every response with one specific, actionable question
- **NEVER output JSON code in your responses**

## Requirement Gathering Framework

Use these phases to guide the conversation:

1. **Vision** – What process is being automated, problem being solved, success criteria
2. **Trigger** – What starts the workflow (event or schedule)
3. **Resources** – Systems, services, tools to connect
4. **Data Flow** – Inputs, transformations, mappings
5. **Authentication** – API keys, OAuth, credentials needed
6. **Logic** – If/then rules, conditions, decision branches
7. **Output** – Where results go, format, who is notified
8. **Error Handling** – Failures, retries, fallback actions
9. **Edge Cases** – Exceptions, weekends, holidays, special rules

## Validation Checklist

Before generating the JSON, confirm you have:
✓ Trigger type and details
✓ Required services and authentication
✓ Input data sources and transformations
✓ Output destinations and formats
✓ Business logic and conditions
✓ Error handling and notifications

## Current Context
- Phase: ${conversationState.phase}
- Completeness: ${conversationState.completeness}%
- Current Focus: ${conversationState.currentFocus || "Initial discovery"}

Remember: Ask one focused question at a time, build requirements progressively, and generate comprehensive workflow JSON when the user confirms the final summary.`
  }

  private getNextQuestion(state: ConversationState): string {
    const unanswered = state.requirements.filter((r) => !r.answered)
    const highPriority = unanswered.filter((r) => r.priority === "high")

    if (state.phase === "discovery") {
      if (highPriority.length > 0) {
        return `Focus on understanding: ${highPriority[0].question}`
      }
      if (unanswered.length > 0) {
        return `Next requirement: ${unanswered[0].question}`
      }
    }

    if (state.phase === "validation") {
      return "Validate and confirm all gathered requirements before proceeding"
    }

    if (state.phase === "generation") {
      return "All requirements gathered - ready for comprehensive workflow generation"
    }

    return "Continue natural conversation to gather workflow requirements"
  }

  initializeRequirements(userInput: string): WorkflowRequirement[] {
    // Analyze user input and generate relevant questions
    const baseRequirements: WorkflowRequirement[] = [
      {
        category: "scope",
        question: "What business process are you looking to automate?",
        answered: false,
        priority: "high",
      },
      {
        category: "triggers",
        question: "What event should start this automation?",
        answered: false,
        priority: "high",
      },
      {
        category: "resources",
        question: "What platforms, tools, or services need to be connected?",
        answered: false,
        priority: "high",
      },
      {
        category: "inputs",
        question: "What information flows through this process?",
        answered: false,
        priority: "medium",
      },
      {
        category: "destinations",
        question: "Where should the final results be delivered?",
        answered: false,
        priority: "medium",
      },
      {
        category: "errors",
        question: "What should happen if something goes wrong?",
        answered: false,
        priority: "low",
      },
    ]

    return this.customizeRequirements(baseRequirements, userInput)
  }

  private customizeRequirements(requirements: WorkflowRequirement[], userInput: string): WorkflowRequirement[] {
    // Customize questions based on user input keywords
    const input = userInput.toLowerCase()

    if (input.includes("email")) {
      requirements.push({
        category: "inputs",
        question: "What email criteria should trigger the automation (sender, subject, attachments)?",
        answered: false,
        priority: "high",
      })
    }

    if (input.includes("schedule") || input.includes("daily") || input.includes("weekly")) {
      requirements[1].question = "What schedule should this automation run on?"
    }

    if (input.includes("data") || input.includes("spreadsheet") || input.includes("csv")) {
      requirements.push({
        category: "inputs",
        question: "What format is your data in and how should it be processed?",
        answered: false,
        priority: "medium",
      })
    }

    return requirements
  }

  updateConversationState(currentState: ConversationState, userMessage: string, aiResponse: string): ConversationState {
    // Analyze the conversation to update requirements and completeness
    const updatedRequirements = this.analyzeAndUpdateRequirements(currentState.requirements, userMessage, aiResponse)

    const completeness = this.calculateCompleteness(updatedRequirements)

    let phase = currentState.phase
    if (completeness >= 80 && phase === "discovery") {
      phase = "validation"
    } else if (completeness >= 90 && phase === "validation") {
      phase = "generation"
    }

    return {
      ...currentState,
      requirements: updatedRequirements,
      completeness,
      phase,
      currentFocus: this.getCurrentFocus(updatedRequirements),
    }
  }

  private analyzeAndUpdateRequirements(
    requirements: WorkflowRequirement[],
    userMessage: string,
    aiResponse: string,
  ): WorkflowRequirement[] {
    const message = userMessage.toLowerCase()
    const response = aiResponse.toLowerCase()

    return requirements.map((req) => {
      if (req.answered) return req

      const isAnswered =
        this.checkIfRequirementAnswered(req, message) || this.checkIfRequirementInResponse(req, response)

      return {
        ...req,
        answered: isAnswered,
        answer: isAnswered ? userMessage : undefined,
      }
    })
  }

  private checkIfRequirementAnswered(requirement: WorkflowRequirement, message: string): boolean {
    const keywords = {
      scope: ["automate", "process", "task", "workflow", "want to", "need to", "daily", "weekly", "schedule"],
      triggers: ["when", "trigger", "start", "schedule", "webhook", "email arrives", "at", "daily", "weekly", "time"],
      resources: ["gmail", "slack", "sheets", "api", "service", "connect", "integration", "twitter", "openai", "email"],
      inputs: ["data", "information", "file", "email", "form", "input", "content", "message"],
      destinations: ["send", "save", "output", "notify", "store", "forward", "email", "to", "@"],
      errors: ["error", "fail", "wrong", "retry", "fallback", "notification", "notify", "email"],
    }

    const categoryKeywords = keywords[requirement.category] || []
    return categoryKeywords.some((keyword) => message.includes(keyword))
  }

  private checkIfRequirementInResponse(requirement: WorkflowRequirement, response: string): boolean {
    const summaryIndicators = [
      "workflow summary",
      "key components",
      "trigger:",
      "processing:",
      "output:",
      "error handling:",
    ]

    return summaryIndicators.some((indicator) => response.includes(indicator))
  }

  private calculateCompleteness(requirements: WorkflowRequirement[]): number {
    const answered = requirements.filter((r) => r.answered).length
    const baseCompleteness = Math.round((answered / requirements.length) * 100)

    // If we have most core requirements, boost to trigger validation phase
    const coreRequirements = requirements.filter((r) => r.priority === "high")
    const coreAnswered = coreRequirements.filter((r) => r.answered).length

    if (coreAnswered >= coreRequirements.length * 0.8) {
      return Math.max(baseCompleteness, 80)
    }

    return baseCompleteness
  }

  private getCurrentFocus(requirements: WorkflowRequirement[]): string {
    const unanswered = requirements.filter((r) => !r.answered)
    if (unanswered.length === 0) return "Ready for generation"

    const highPriority = unanswered.filter((r) => r.priority === "high")
    if (highPriority.length > 0) {
      return highPriority[0].category
    }

    return unanswered[0].category
  }

  shouldGenerateWorkflow(state: ConversationState): boolean {
    return state.completeness >= 80 && state.phase === "generation"
  }

  generateSummary(state: ConversationState): string {
    const requirements = state.requirements.filter((r) => r.answered)
    const summary = requirements.reduce((acc, req) => {
      return `${acc}\n- ${req.category}: ${req.answer}`
    }, "")

    return `Perfect! I have all the information needed to create your n8n workflow. Here's what we'll build:

**Workflow Summary:**
${summary}

**Key Components:**
1. **Trigger**: ${requirements.find((r) => r.category === "triggers")?.answer || "Not specified"}
2. **Processing**: ${requirements.find((r) => r.category === "inputs")?.answer || "Not specified"}
3. **Output**: ${requirements.find((r) => r.category === "destinations")?.answer || "Not specified"}
4. **Error Handling**: ${requirements.find((r) => r.category === "errors")?.answer || "Not specified"}

Does this capture everything, or is there anything else we should consider?`
  }

  generateWorkflowJSON(state: ConversationState): string {
    // Placeholder for JSON generation logic
    // This should be replaced with actual JSON generation code
    return JSON.stringify({
      workflow: {
        name: "Sample Workflow",
        nodes: [],
        connections: [],
      },
    })
  }

  handleUserConfirmation(userMessage: string): string {
    const confirmations = ["yes", "looks good", "that's correct", "let's generate it"]
    if (confirmations.some((confirmation) => userMessage.toLowerCase().includes(confirmation))) {
      return "Perfect! I have all the information needed to create your n8n workflow. You can now click the Generate Workflow button to create the complete JSON configuration."
    }
    return "Please confirm if the summary captures everything correctly."
  }
}
