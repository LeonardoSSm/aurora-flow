/** Um agente exposto pela LOPS IA em `GET {LOPS_AI_BASE_URL}/models`. */
export interface LopsAiAgent {
  slug: string;
  name: string;
  model: string | null;
  visionModel: string | null;
  source: string | null;
}

export interface LopsAiAgentsResponse {
  agents: LopsAiAgent[];
}
