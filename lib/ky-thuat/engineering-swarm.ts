// lib/engineering-swarm.ts — Facade for Unified Multi-Agent Swarm Orchestrator (PIN-3)
export {
  type SwarmAgentRole,
  type DebateStance,
  type DebateStatus,
  type ConsensusLevel,
  type SwarmArgumentRecord,
  type SwarmDebateRecord,
  type AutonomousTechnicalDraft,
  AGENT_AUTHORITY_WEIGHTS,
  calculateSwarmConsensus,
  generateAutonomousTechnicalDraft,
  listSwarmDebates,
  getSwarmDebateById,
  createSwarmDebate,
  addSwarmArgument,
  synthesizeSwarmDebate,
} from "@/lib/ky-thuat/engineering-swarm-orchestrator";
