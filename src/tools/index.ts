/**
 * MCP tool registration.
 */

import { MCP_TOOL_NAMES } from '@/constants'
import { handleLogHumanDecision, LOG_HUMAN_DECISION_SCHEMA } from '@/tools/log-human-decision'
import { handleSubmitPhaseReview, SUBMIT_PHASE_REVIEW_SCHEMA } from '@/tools/submit-phase-review'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

export function registerTools(server: McpServer): void {
  server.registerTool(MCP_TOOL_NAMES.SUBMIT_PHASE_REVIEW, SUBMIT_PHASE_REVIEW_SCHEMA, async args =>
    handleSubmitPhaseReview(args)
  )
  server.registerTool(MCP_TOOL_NAMES.LOG_HUMAN_DECISION, LOG_HUMAN_DECISION_SCHEMA, async args =>
    handleLogHumanDecision(args)
  )
}
