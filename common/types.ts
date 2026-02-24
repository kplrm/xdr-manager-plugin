export type AgentStatus = 'healthy' | 'degraded' | 'offline';
export type XdrAction = 'restart' | 'isolate' | 'upgrade';

export interface XdrPolicy {
  id: string;
  name: string;
  description: string;
}

export interface XdrAgent {
  id: string;
  name: string;
  policyId: string;
  status: AgentStatus;
  lastSeen: string;
  tags: string[];
  version: string;
}

export interface ListAgentsResponse {
  agents: XdrAgent[];
  policies: XdrPolicy[];
}

export interface EnrollAgentRequest {
  name: string;
  policyId: string;
  tags?: string[];
}

export interface EnrollAgentResponse {
  agent: XdrAgent;
}

export interface RunActionRequest {
  action: XdrAction;
}

export interface RunActionResponse {
  agent: XdrAgent;
  message: string;
}
