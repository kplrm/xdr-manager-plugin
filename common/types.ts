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

export interface ControlPlaneHeartbeatRequest {
  agent_id: string;
  machine_id: string;
  hostname: string;
  policy_id: string;
  tags: string[];
  agent_version: string;
}

export interface ControlPlaneHeartbeatResponse {
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

// ── Telemetry ingestion ────────────────────────────────────────────────────

export interface TelemetryEvent {
  id: string;
  '@timestamp': string;
  'event.type': string;
  'event.category': string;
  'event.kind': string;
  'event.severity': number;
  'event.module': string;
  'agent.id': string;
  'host.hostname': string;
  payload?: Record<string, unknown>;
  'threat.tactic.name'?: string;
  'threat.technique.id'?: string;
  'threat.technique.subtechnique.id'?: string;
  tags?: string[];
}

export interface ControlPlaneTelemetryRequest {
  agent_id: string;
  events: TelemetryEvent[];
}

export interface ControlPlaneTelemetryResponse {
  indexed: number;
  message: string;
}

// ── Telemetry dashboard query responses ────────────────────────────────────

export interface TelemetryHostMetrics {
  cpu: {
    cores: number;
    total_pct: number;
    user_pct: number;
    system_pct: number;
    idle_pct: number;
    iowait_pct: number;
    steal_pct: number;
  };
  memory: {
    total: number;
    used_bytes: number;
    used_pct: number;
    free: number;
    actual_free: number;
    cached: number;
    buffer: number;
    swap_total: number;
    swap_free: number;
    swap_used_bytes: number;
  };
  timestamp: string;
}

export interface TelemetryHostTimelinePoint {
  timestamp: string;
  cpu_total_pct: number;
  cpu_user_pct: number;
  cpu_system_pct: number;
  cpu_iowait_pct: number;
  memory_used_pct: number;
}

export interface TelemetryHostResponse {
  latest: TelemetryHostMetrics | null;
  timeline: TelemetryHostTimelinePoint[];
}

export interface TelemetryProcessEntry {
  name: string;
  pid: number;
  cpu_pct: number;
  executable: string;
  command_line: string;
  timestamp: string;
}

export interface TelemetryProcessResponse {
  processes: TelemetryProcessEntry[];
  total_events: number;
}

export interface TelemetryNetworkConnection {
  direction: string;
  local_addr: string;
  local_port: number;
  remote_addr: string;
  remote_port: number;
  protocol: string;
  state: string;
  transport: string;
  timestamp: string;
  event_type: string;
}

export interface TelemetryNetworkResponse {
  connections: TelemetryNetworkConnection[];
  summary: {
    total: number;
    inbound: number;
    outbound: number;
  };
  protocols: Record<string, number>;
  states: Record<string, number>;
}
