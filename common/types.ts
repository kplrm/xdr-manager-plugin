export type AgentStatus = 'healthy' | 'degraded' | 'offline' | 'unseen';
export type XdrAction = 'restart' | 'isolate' | 'upgrade';
export type PolicyLogLevel = 'minimal' | 'standard' | 'verbose';

export interface XdrPolicy {
  id: string;
  name: string;
  description: string;
  malwareProtection: boolean;
  fileIntegrityMonitoring: boolean;
  autoUpgrade: boolean;
  osqueryEnabled: boolean;
  logLevel: PolicyLogLevel;
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
  hostname: string;
  policyId: string;
  tags?: string[];
}

export interface EnrollAgentResponse {
  agent: XdrAgent;
}

export interface GenerateEnrollmentTokenRequest {
  policyId: string;
}

export interface GenerateEnrollmentTokenResponse {
  token: string;
  policyId: string;
  createdAt: string;
}

export interface EnrollmentTokenStatusResponse {
  token: string;
  policyId: string;
  status: 'pending' | 'consumed';
  createdAt: string;
  consumedAt?: string;
  consumedAgentId?: string;
  consumedHostname?: string;
}

export interface ControlPlaneEnrollRequest {
  agent_id: string;
  machine_id: string;
  hostname: string;
  architecture: string;
  os_type: string;
  ip_addresses: string[];
  policy_id: string;
  tags: string[];
  agent_version: string;
}

export interface ControlPlaneEnrollResponse {
  enrollment_id: string;
  message: string;
}

export interface RunActionRequest {
  action: XdrAction;
}

export interface RunActionResponse {
  agent: XdrAgent;
  message: string;
}

export interface ListPoliciesResponse {
  policies: XdrPolicy[];
}

export interface UpsertPolicyRequest {
  name: string;
  description: string;
  malwareProtection: boolean;
  fileIntegrityMonitoring: boolean;
  autoUpgrade: boolean;
  osqueryEnabled: boolean;
  logLevel: PolicyLogLevel;
}

export interface UpsertPolicyResponse {
  policy: XdrPolicy;
}
