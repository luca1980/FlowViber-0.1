interface N8nNode {
  id: string
  name: string
  type: string
  typeVersion: number
  position: [number, number]
  parameters: Record<string, any>
  credentials?: Record<string, any>
}

interface N8nWorkflow {
  name: string
  nodes: N8nNode[]
  connections: Record<string, any>
  settings?: Record<string, any>
  staticData?: any
  pinData?: Record<string, any>
  versionId?: string | null
}

interface ValidationError {
  type: "error" | "warning"
  node?: string
  message: string
  field?: string
}

export class WorkflowValidator {
  private knownNodeTypes = new Set([
    "n8n-nodes-base.scheduleTrigger",
    "n8n-nodes-base.webhook",
    "n8n-nodes-base.emailTriggerImap",
    "n8n-nodes-base.httpRequest",
    "n8n-nodes-base.gmail",
    "n8n-nodes-base.googleSheets",
    "n8n-nodes-base.slack",
    "n8n-nodes-base.discord",
    "n8n-nodes-base.telegram",
    "n8n-nodes-base.twitter",
    "n8n-nodes-base.github",
    "n8n-nodes-base.gitlab",
    "n8n-nodes-base.notion",
    "n8n-nodes-base.airtable",
    "n8n-nodes-base.mysql",
    "n8n-nodes-base.postgres",
    "n8n-nodes-base.mongodb",
    "n8n-nodes-base.redis",
    "n8n-nodes-base.if",
    "n8n-nodes-base.switch",
    "n8n-nodes-base.merge",
    "n8n-nodes-base.splitInBatches",
    "n8n-nodes-base.set",
    "n8n-nodes-base.code",
    "n8n-nodes-base.function",
    "n8n-nodes-base.functionItem",
    "n8n-nodes-base.wait",
    "n8n-nodes-base.noOp",
    "n8n-nodes-base.start",
    "n8n-nodes-base.executeCommand",
    "n8n-nodes-base.openAi",
  ])

  /**
   * Validate workflow JSON structure
   */
  validateWorkflow(jsonString: string): {
    valid: boolean
    errors: ValidationError[]
    warnings: ValidationError[]
    workflow?: N8nWorkflow
  } {
    const errors: ValidationError[] = []
    const warnings: ValidationError[] = []

    try {
      // Parse JSON
      const workflow = JSON.parse(jsonString) as N8nWorkflow

      // Validate basic structure
      if (!workflow.name) {
        errors.push({
          type: "error",
          message: "Workflow must have a name",
          field: "name",
        })
      }

      if (!Array.isArray(workflow.nodes)) {
        errors.push({
          type: "error",
          message: "Workflow must have a nodes array",
          field: "nodes",
        })
      } else {
        // Validate nodes
        this.validateNodes(workflow.nodes, errors, warnings)
      }

      if (!workflow.connections || typeof workflow.connections !== "object") {
        errors.push({
          type: "error",
          message: "Workflow must have a connections object",
          field: "connections",
        })
      } else {
        // Validate connections
        this.validateConnections(workflow.connections, workflow.nodes, errors, warnings)
      }

      // Check for trigger node
      const hasTrigger = workflow.nodes?.some(
        (node) =>
          node.type.includes("Trigger") || node.type.includes("webhook") || node.type === "n8n-nodes-base.start",
      )

      if (!hasTrigger) {
        warnings.push({
          type: "warning",
          message: "Workflow has no trigger node - it can only be executed manually",
        })
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        workflow: errors.length === 0 ? workflow : undefined,
      }
    } catch (error) {
      errors.push({
        type: "error",
        message: `Invalid JSON: ${error instanceof Error ? error.message : "Parse error"}`,
      })
      return { valid: false, errors, warnings }
    }
  }

  /**
   * Validate individual nodes
   */
  private validateNodes(nodes: N8nNode[], errors: ValidationError[], warnings: ValidationError[]) {
    const nodeNames = new Set<string>()
    const nodeIds = new Set<string>()

    for (const node of nodes) {
      // Check for duplicate names
      if (nodeNames.has(node.name)) {
        errors.push({
          type: "error",
          node: node.name,
          message: `Duplicate node name: ${node.name}`,
        })
      }
      nodeNames.add(node.name)

      // Check for duplicate IDs
      if (nodeIds.has(node.id)) {
        errors.push({
          type: "error",
          node: node.name,
          message: `Duplicate node ID: ${node.id}`,
        })
      }
      nodeIds.add(node.id)

      // Validate node type
      if (!this.knownNodeTypes.has(node.type)) {
        warnings.push({
          type: "warning",
          node: node.name,
          message: `Unknown node type: ${node.type}. This might be a custom or newer node.`,
        })
      }

      // Validate required fields
      if (!node.type) {
        errors.push({
          type: "error",
          node: node.name,
          message: "Node must have a type",
          field: "type",
        })
      }

      if (!node.position || !Array.isArray(node.position) || node.position.length !== 2) {
        errors.push({
          type: "error",
          node: node.name,
          message: "Node must have a position [x, y]",
          field: "position",
        })
      }

      if (!node.parameters || typeof node.parameters !== "object") {
        warnings.push({
          type: "warning",
          node: node.name,
          message: "Node has no parameters configured",
        })
      }

      // Validate specific node types
      this.validateNodeType(node, errors, warnings)
    }
  }

  /**
   * Validate specific node type requirements
   */
  private validateNodeType(node: N8nNode, errors: ValidationError[], warnings: ValidationError[]) {
    switch (node.type) {
      case "n8n-nodes-base.scheduleTrigger":
        if (!node.parameters.rule) {
          warnings.push({
            type: "warning",
            node: node.name,
            message: "Schedule trigger has no schedule configured",
          })
        }
        break

      case "n8n-nodes-base.webhook":
        if (!node.parameters.path && !node.parameters.options?.path) {
          warnings.push({
            type: "warning",
            node: node.name,
            message: "Webhook has no path configured",
          })
        }
        break

      case "n8n-nodes-base.httpRequest":
        if (!node.parameters.url) {
          errors.push({
            type: "error",
            node: node.name,
            message: "HTTP Request node must have a URL",
          })
        }
        break

      case "n8n-nodes-base.gmail":
        if (!node.parameters.operation) {
          errors.push({
            type: "error",
            node: node.name,
            message: "Gmail node must have an operation specified",
          })
        }
        break

      case "n8n-nodes-base.if":
        if (!node.parameters.conditions) {
          warnings.push({
            type: "warning",
            node: node.name,
            message: "IF node has no conditions configured",
          })
        }
        break
    }
  }

  /**
   * Validate connections between nodes
   */
  private validateConnections(
    connections: Record<string, any>,
    nodes: N8nNode[],
    errors: ValidationError[],
    warnings: ValidationError[],
  ) {
    const nodeNames = new Set(nodes.map((n) => n.name))

    // Check all connections reference existing nodes
    for (const [sourceName, sourceConnections] of Object.entries(connections)) {
      if (!nodeNames.has(sourceName)) {
        errors.push({
          type: "error",
          message: `Connection from non-existent node: ${sourceName}`,
        })
        continue
      }

      // Check destination nodes
      if (sourceConnections.main && Array.isArray(sourceConnections.main)) {
        for (const outputConnections of sourceConnections.main) {
          if (Array.isArray(outputConnections)) {
            for (const connection of outputConnections) {
              if (connection.node && !nodeNames.has(connection.node)) {
                errors.push({
                  type: "error",
                  node: sourceName,
                  message: `Connection to non-existent node: ${connection.node}`,
                })
              }
            }
          }
        }
      }
    }

    // Check for orphaned nodes (nodes with no connections)
    const connectedNodes = new Set<string>()
    connectedNodes.add("Start") // Start node doesn't need incoming connections

    // Add all source nodes
    Object.keys(connections).forEach((name) => connectedNodes.add(name))

    // Add all destination nodes
    for (const sourceConnections of Object.values(connections)) {
      if (sourceConnections.main && Array.isArray(sourceConnections.main)) {
        for (const outputConnections of sourceConnections.main) {
          if (Array.isArray(outputConnections)) {
            for (const connection of outputConnections) {
              if (connection.node) {
                connectedNodes.add(connection.node)
              }
            }
          }
        }
      }
    }

    // Find orphaned nodes
    for (const node of nodes) {
      if (!connectedNodes.has(node.name) && !node.type.includes("Trigger")) {
        warnings.push({
          type: "warning",
          node: node.name,
          message: `Node "${node.name}" is not connected to any other nodes`,
        })
      }
    }
  }

  /**
   * Quick fix common issues
   */
  autoFix(workflow: N8nWorkflow): N8nWorkflow {
    const fixed = { ...workflow }

    // Ensure required fields
    if (!fixed.name) {
      fixed.name = "Generated Workflow"
    }

    if (!fixed.settings) {
      fixed.settings = { executionOrder: "v1" }
    }

    if (!fixed.staticData) {
      fixed.staticData = null
    }

    if (!fixed.pinData) {
      fixed.pinData = {}
    }

    if (!fixed.versionId) {
      fixed.versionId = null
    }

    // Fix node positions if needed
    if (fixed.nodes) {
      let x = 250
      let y = 300

      for (const node of fixed.nodes) {
        if (!node.position || !Array.isArray(node.position)) {
          node.position = [x, y]
          x += 250
          if (x > 1000) {
            x = 250
            y += 150
          }
        }

        // Ensure typeVersion
        if (!node.typeVersion) {
          node.typeVersion = 1
        }
      }
    }

    return fixed
  }
}

// Export singleton instance
export const workflowValidator = new WorkflowValidator()
