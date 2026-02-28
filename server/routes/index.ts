import { schema } from '@osd/config-schema';
import { randomBytes } from 'crypto';
import { IRouter, ISavedObjectsRepository, Logger } from '../../../../src/core/server';
import {
  AgentStatus,
  ControlPlaneHeartbeatRequest,
  ControlPlaneHeartbeatResponse,
  ControlPlaneEnrollRequest,
  ControlPlaneEnrollResponse,
  ControlPlaneTelemetryRequest,
  ControlPlaneTelemetryResponse,
  EnrollmentTokenStatusResponse,
  GenerateEnrollmentTokenResponse,
  ListAgentsResponse,
  RunActionRequest,
  RunActionResponse,
  UpsertPolicyRequest,
  UpsertPolicyResponse,
  XdrAction,
  XdrAgent,
  XdrPolicy,
  XDR_AGENT_SAVED_OBJECT_TYPE,
} from '../../common';

const policies: XdrPolicy[] = [
  {
    id: 'default-endpoint',
    name: 'Default Endpoint Policy',
    description: 'Baseline telemetry and malware prevention.',
    malwareProtection: true,
    fileIntegrityMonitoring: true,
    autoUpgrade: false,
    osqueryEnabled: false,
    logLevel: 'standard',
  },
  {
    id: 'high-security-linux',
    name: 'High Security Linux',
    description: 'Hardening profile for production Linux workloads.',
    malwareProtection: true,
    fileIntegrityMonitoring: true,
    autoUpgrade: true,
    osqueryEnabled: true,
    logLevel: 'verbose',
  },
];

type XdrAgentAttributes = Omit<XdrAgent, 'id'>;

function toXdrAgent(so: { id: string; attributes: XdrAgentAttributes }): XdrAgent {
  return {
    id: so.id,
    name: so.attributes.name,
    policyId: so.attributes.policyId,
    status: so.attributes.status,
    lastSeen: so.attributes.lastSeen,
    tags: so.attributes.tags,
    version: so.attributes.version,
  };
}

type EnrollmentTokenRecord = {
  token: string;
  policyId: string;
  createdAt: string;
  consumedAt?: string;
  consumedAgentId?: string;
  consumedHostname?: string;
};

const enrollmentTokens: EnrollmentTokenRecord[] = [];

const actionToStatusMap: Record<XdrAction, AgentStatus> = {
  restart: 'healthy',
  isolate: 'offline',
  upgrade: 'healthy',
};

const STALE_AGENT_THRESHOLD_MS = 5 * 60 * 1000;

const isUnknownUnseenPlaceholder = (agent: XdrAgent): boolean => {
  return agent.status === 'unseen' && (agent.name === 'unknown' || agent.name === 'localhost');
};

const deriveAgentStatus = (agent: XdrAgent, nowMs: number): AgentStatus => {
  if (agent.status === 'unseen') {
    return 'unseen';
  }

  const lastSeenMs = Date.parse(agent.lastSeen);
  if (Number.isFinite(lastSeenMs) && nowMs - lastSeenMs >= STALE_AGENT_THRESHOLD_MS) {
    return 'offline';
  }

  return agent.status;
};

const bumpVersion = (version: string): string => {
  const parts = version.split('.').map((part) => Number(part));
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) {
    return '1.0.1';
  }

  parts[2] += 1;
  return parts.join('.');
};

const toPolicyId = (value: string): string => {
  const normalized = value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

  return normalized || `policy-${Date.now()}`;
};

const issueEnrollmentToken = (): string => {
  return `xdr_enroll_${randomBytes(24).toString('base64url')}`;
};

const readBearerToken = (authorization: string | string[] | undefined): string | null => {
  if (!authorization) {
    return null;
  }

  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  const match = /^Bearer\s+(.+)$/i.exec(value.trim());
  if (!match) {
    return null;
  }

  return match[1].trim() || null;
};

const policyRequestSchema = schema.object({
  name: schema.string({ minLength: 1 }),
  description: schema.string({ minLength: 1 }),
  malwareProtection: schema.boolean(),
  fileIntegrityMonitoring: schema.boolean(),
  autoUpgrade: schema.boolean(),
  osqueryEnabled: schema.boolean(),
  logLevel: schema.oneOf([
    schema.literal('minimal'),
    schema.literal('standard'),
    schema.literal('verbose'),
  ]),
});

export function defineRoutes(
  router: IRouter,
  logger: Logger,
  agentRepoPromise: Promise<ISavedObjectsRepository>
) {
  router.post(
    {
      path: '/api/xdr_manager/enrollment_tokens',
      validate: {
        body: schema.object({
          policyId: schema.string({ minLength: 1 }),
        }),
      },
    },
    async (_context, request, response) => {
      const selectedPolicy = policies.find((policy) => policy.id === request.body.policyId);

      if (!selectedPolicy) {
        return response.badRequest({
          body: `Unknown policy [${request.body.policyId}]`,
        });
      }

      const token = issueEnrollmentToken();
      const createdAt = new Date().toISOString();
      enrollmentTokens.unshift({
        token,
        policyId: request.body.policyId,
        createdAt,
      });

      const body: GenerateEnrollmentTokenResponse = {
        token,
        policyId: request.body.policyId,
        createdAt,
      };

      return response.ok({ body });
    }
  );

  router.get(
    {
      path: '/api/xdr_manager/enrollment_tokens/{token}/status',
      validate: {
        params: schema.object({
          token: schema.string({ minLength: 1 }),
        }),
      },
    },
    async (_context, request, response) => {
      const tokenRecord = enrollmentTokens.find((item) => item.token === request.params.token);
      if (!tokenRecord) {
        return response.notFound({
          body: `Enrollment token [${request.params.token}] not found`,
        });
      }

      const body: EnrollmentTokenStatusResponse = {
        token: tokenRecord.token,
        policyId: tokenRecord.policyId,
        status: tokenRecord.consumedAt ? 'consumed' : 'pending',
        createdAt: tokenRecord.createdAt,
        consumedAt: tokenRecord.consumedAt,
        consumedAgentId: tokenRecord.consumedAgentId,
        consumedHostname: tokenRecord.consumedHostname,
      };

      return response.ok({ body });
    }
  );

  router.post(
    {
      path: '/api/v1/agents/enroll',
      validate: {
        body: schema.object({
          agent_id: schema.string({ minLength: 1 }),
          machine_id: schema.string({ minLength: 1 }),
          hostname: schema.string({ minLength: 1 }),
          architecture: schema.string({ minLength: 1 }),
          os_type: schema.string({ minLength: 1 }),
          ip_addresses: schema.arrayOf(schema.string()),
          policy_id: schema.string({ minLength: 1 }),
          tags: schema.arrayOf(schema.string()),
          agent_version: schema.string({ minLength: 1 }),
        }),
      },
      options: {
        authRequired: false,
      },
    },
    async (_context, request, response) => {
      const bearerToken = readBearerToken(request.headers.authorization);
      if (!bearerToken) {
        return response.unauthorized({
          body: {
            message: 'Missing or invalid Authorization header',
          },
        });
      }

      const tokenRecord = enrollmentTokens.find((item) => item.token === bearerToken);
      if (!tokenRecord) {
        return response.unauthorized({
          body: {
            message: 'Enrollment token is invalid',
          },
        });
      }

      if (tokenRecord.consumedAt) {
        return response.unauthorized({
          body: {
            message: 'Enrollment token already used',
          },
        });
      }

      const payload = request.body as ControlPlaneEnrollRequest;
      if (tokenRecord.policyId !== payload.policy_id) {
        return response.badRequest({
          body: {
            message: `Enrollment token policy mismatch: token=${tokenRecord.policyId} request=${payload.policy_id}`,
          },
        });
      }

      const selectedPolicy = policies.find((policy) => policy.id === payload.policy_id);
      if (!selectedPolicy) {
        return response.badRequest({
          body: {
            message: `Unknown policy [${payload.policy_id}]`,
          },
        });
      }

      const now = new Date().toISOString();
      const repo = await agentRepoPromise;
      const agentAttrs: XdrAgentAttributes = {
        name: payload.hostname,
        policyId: payload.policy_id,
        status: 'healthy',
        lastSeen: now,
        tags: payload.tags,
        version: payload.agent_version,
      };

      let existingAgent: { id: string; attributes: XdrAgentAttributes } | null = null;
      try {
        existingAgent = await repo.get<XdrAgentAttributes>(
          XDR_AGENT_SAVED_OBJECT_TYPE,
          payload.agent_id
        );
      } catch (err: any) {
        if (err?.output?.statusCode !== 404) throw err;
      }

      if (existingAgent) {
        await repo.update(XDR_AGENT_SAVED_OBJECT_TYPE, payload.agent_id, agentAttrs);
      } else {
        // Check for an "unseen" placeholder agent for this policy
        const placeholders = await repo.find<XdrAgentAttributes>({
          type: XDR_AGENT_SAVED_OBJECT_TYPE,
          perPage: 10000,
        });
        const placeholder = placeholders.saved_objects.find(
          (so) =>
            isUnknownUnseenPlaceholder(toXdrAgent(so)) &&
            so.attributes.policyId === payload.policy_id
        );

        if (placeholder) {
          // Replace the placeholder with the real agent
          await repo.delete(XDR_AGENT_SAVED_OBJECT_TYPE, placeholder.id);
        }

        await repo.create<XdrAgentAttributes>(XDR_AGENT_SAVED_OBJECT_TYPE, agentAttrs, {
          id: payload.agent_id,
        });
      }

      const body: ControlPlaneEnrollResponse = {
        enrollment_id: payload.agent_id,
        message: `enrolled agent ${payload.hostname}`,
      };

      tokenRecord.consumedAt = now;
      tokenRecord.consumedAgentId = payload.agent_id;
      tokenRecord.consumedHostname = payload.hostname;

      return response.ok({ body });
    }
  );

  router.post(
    {
      path: '/api/v1/agents/heartbeat',
      validate: {
        body: schema.object({
          agent_id: schema.string({ minLength: 1 }),
          machine_id: schema.string({ minLength: 1 }),
          hostname: schema.string({ minLength: 1 }),
          policy_id: schema.string({ minLength: 1 }),
          tags: schema.arrayOf(schema.string()),
          agent_version: schema.string({ minLength: 1 }),
        }),
      },
      options: {
        authRequired: false,
      },
    },
    async (_context, request, response) => {
      const payload = request.body as ControlPlaneHeartbeatRequest;
      const repo = await agentRepoPromise;

      try {
        await repo.get<XdrAgentAttributes>(XDR_AGENT_SAVED_OBJECT_TYPE, payload.agent_id);
      } catch (err: any) {
        if (err?.output?.statusCode === 404) {
          return response.notFound({
            body: {
              message: `Agent [${payload.agent_id}] not found`,
            },
          });
        }
        throw err;
      }

      await repo.update(XDR_AGENT_SAVED_OBJECT_TYPE, payload.agent_id, {
        name: payload.hostname,
        policyId: payload.policy_id,
        status: 'healthy' as AgentStatus,
        lastSeen: new Date().toISOString(),
        tags: payload.tags,
        version: payload.agent_version,
      });

      const body: ControlPlaneHeartbeatResponse = {
        message: `heartbeat accepted for ${payload.hostname}`,
      };

      return response.ok({ body });
    }
  );

  router.get(
    {
      path: '/api/xdr_manager/agents',
      validate: false,
    },
    async (_context, _request, response) => {
      const repo = await agentRepoPromise;
      const result = await repo.find<XdrAgentAttributes>({
        type: XDR_AGENT_SAVED_OBJECT_TYPE,
        perPage: 10000,
        sortField: 'lastSeen',
        sortOrder: 'desc',
      });

      const nowMs = Date.now();
      const body: ListAgentsResponse = {
        agents: result.saved_objects.map((so) => {
          const agent = toXdrAgent(so);
          return {
            ...agent,
            name: agent.status === 'unseen' ? 'unknown' : agent.name,
            status: deriveAgentStatus(agent, nowMs),
          };
        }),
        policies,
      };

      return response.ok({ body });
    }
  );

  router.post(
    {
      path: '/api/xdr_manager/agents/enroll',
      validate: {
        body: schema.object({
          hostname: schema.string({ minLength: 1 }),
          policyId: schema.string({ minLength: 1 }),
          tags: schema.maybe(schema.arrayOf(schema.string())),
        }),
      },
    },
    async (_context, request, response) => {
      const selectedPolicy = policies.find((policy) => policy.id === request.body.policyId);

      if (!selectedPolicy) {
        return response.badRequest({
          body: `Unknown policy [${request.body.policyId}]`,
        });
      }

      const repo = await agentRepoPromise;
      const agentId = `agent-${Date.now()}`;
      const attrs: XdrAgentAttributes = {
        name: 'unknown',
        policyId: request.body.policyId,
        status: 'unseen',
        lastSeen: new Date().toISOString(),
        tags: request.body.tags ?? [],
        version: '1.0.0',
      };

      await repo.create<XdrAgentAttributes>(XDR_AGENT_SAVED_OBJECT_TYPE, attrs, {
        id: agentId,
      });

      const newAgent: XdrAgent = { id: agentId, ...attrs };

      return response.ok({
        body: {
          agent: newAgent,
        },
      });
    }
  );

  router.get(
    {
      path: '/api/xdr_manager/policies',
      validate: false,
    },
    async (_context, _request, response) => {
      return response.ok({
        body: {
          policies,
        },
      });
    }
  );

  router.post(
    {
      path: '/api/xdr_manager/policies',
      validate: {
        body: policyRequestSchema,
      },
    },
    async (_context, request, response) => {
      const payload = request.body as UpsertPolicyRequest;
      const baseId = toPolicyId(payload.name);
      let id = baseId;
      let count = 1;
      while (policies.some((policy) => policy.id === id)) {
        count += 1;
        id = `${baseId}-${count}`;
      }

      const newPolicy: XdrPolicy = {
        id,
        ...payload,
      };
      policies.unshift(newPolicy);

      const body: UpsertPolicyResponse = {
        policy: newPolicy,
      };

      return response.ok({ body });
    }
  );

  router.put(
    {
      path: '/api/xdr_manager/policies/{id}',
      validate: {
        params: schema.object({
          id: schema.string({ minLength: 1 }),
        }),
        body: policyRequestSchema,
      },
    },
    async (_context, request, response) => {
      const policy = policies.find((item) => item.id === request.params.id);

      if (!policy) {
        return response.notFound({
          body: `Policy [${request.params.id}] not found`,
        });
      }

      const payload = request.body as UpsertPolicyRequest;
      policy.name = payload.name;
      policy.description = payload.description;
      policy.malwareProtection = payload.malwareProtection;
      policy.fileIntegrityMonitoring = payload.fileIntegrityMonitoring;
      policy.autoUpgrade = payload.autoUpgrade;
      policy.osqueryEnabled = payload.osqueryEnabled;
      policy.logLevel = payload.logLevel;

      const body: UpsertPolicyResponse = {
        policy,
      };

      return response.ok({ body });
    }
  );

  router.delete(
    {
      path: '/api/xdr_manager/policies/{id}',
      validate: {
        params: schema.object({
          id: schema.string({ minLength: 1 }),
        }),
      },
    },
    async (_context, request, response) => {
      const policyIndex = policies.findIndex((item) => item.id === request.params.id);

      if (policyIndex === -1) {
        return response.notFound({
          body: `Policy [${request.params.id}] not found`,
        });
      }

      const agentRepo = await agentRepoPromise;
      const assignedResult = await agentRepo.find<XdrAgentAttributes>({
        type: XDR_AGENT_SAVED_OBJECT_TYPE,
        perPage: 10000,
      });
      if (
        assignedResult.saved_objects.some(
          (so) => so.attributes.policyId === request.params.id
        )
      ) {
        return response.badRequest({
          body: `Policy [${request.params.id}] is currently assigned to one or more agents.`,
        });
      }

      const [deletedPolicy] = policies.splice(policyIndex, 1);

      return response.ok({
        body: {
          deletedPolicyId: deletedPolicy.id,
        },
      });
    }
  );

  router.post(
    {
      path: '/api/xdr_manager/agents/{id}/action',
      validate: {
        params: schema.object({
          id: schema.string({ minLength: 1 }),
        }),
        body: schema.object({
          action: schema.oneOf([
            schema.literal('restart'),
            schema.literal('isolate'),
            schema.literal('upgrade'),
          ]),
        }),
      },
    },
    async (_context, request, response) => {
      const repo = await agentRepoPromise;

      let existing;
      try {
        existing = await repo.get<XdrAgentAttributes>(
          XDR_AGENT_SAVED_OBJECT_TYPE,
          request.params.id
        );
      } catch (err: any) {
        if (err?.output?.statusCode === 404) {
          return response.notFound({
            body: `Agent [${request.params.id}] not found`,
          });
        }
        throw err;
      }

      const { action } = request.body as RunActionRequest;

      const updates: Partial<XdrAgentAttributes> = {
        status: actionToStatusMap[action],
        lastSeen: new Date().toISOString(),
      };
      if (action === 'upgrade') {
        updates.version = bumpVersion(existing.attributes.version);
      }

      await repo.update(XDR_AGENT_SAVED_OBJECT_TYPE, request.params.id, updates);

      const agent: XdrAgent = {
        ...toXdrAgent(existing),
        ...updates,
      };

      const body: RunActionResponse = {
        agent,
        message: `Action [${action}] completed for ${agent.name}.`,
      };

      return response.ok({ body });
    }
  );

  // ── Telemetry ingestion ─────────────────────────────────────────────────
  // Agent-facing endpoint: receives batched telemetry events and indexes
  // them into OpenSearch under .xdr-agent-telemetry-YYYY.MM.DD.

  const XDR_TELEMETRY_INDEX_PREFIX = '.xdr-agent-telemetry';

  const telemetryEventSchema = schema.object({
    id: schema.string(),
    '@timestamp': schema.string(),
    'event.type': schema.string(),
    'event.category': schema.string(),
    'event.kind': schema.string(),
    'event.severity': schema.number(),
    'event.module': schema.string(),
    'agent.id': schema.string(),
    'host.hostname': schema.string(),
    payload: schema.maybe(schema.recordOf(schema.string(), schema.any())),
    'threat.tactic.name': schema.maybe(schema.string()),
    'threat.technique.id': schema.maybe(schema.string()),
    'threat.technique.subtechnique.id': schema.maybe(schema.string()),
    tags: schema.maybe(schema.arrayOf(schema.string())),
  });

  router.post(
    {
      path: '/api/v1/agents/telemetry',
      validate: {
        body: schema.object({
          agent_id: schema.string({ minLength: 1 }),
          events: schema.arrayOf(telemetryEventSchema, { minSize: 1, maxSize: 5000 }),
        }),
      },
      options: {
        authRequired: false,
      },
    },
    async (context, request, response) => {
      const payload = request.body as ControlPlaneTelemetryRequest;

      // Build the daily index name
      const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const indexName = `${XDR_TELEMETRY_INDEX_PREFIX}-${today}`;

      try {
        const opensearchClient = context.core.opensearch.client.asInternalUser;

        // Ensure the index exists (create if missing, ignore if already exists)
        const indexExists = await opensearchClient.indices.exists({ index: indexName });
        if (!indexExists.body) {
          await opensearchClient.indices.create({
            index: indexName,
            body: {
              settings: {
                number_of_shards: 1,
                number_of_replicas: 0,
                'index.hidden': true,
              },
              mappings: {
                properties: {
                  '@timestamp': { type: 'date' },
                  'event.type': { type: 'keyword' },
                  'event.category': { type: 'keyword' },
                  'event.kind': { type: 'keyword' },
                  'event.severity': { type: 'integer' },
                  'event.module': { type: 'keyword' },
                  'agent.id': { type: 'keyword' },
                  'host.hostname': { type: 'keyword' },
                  tags: { type: 'keyword' },
                  'threat.tactic.name': { type: 'keyword' },
                  'threat.technique.id': { type: 'keyword' },
                  'threat.technique.subtechnique.id': { type: 'keyword' },
                  payload: {
                    type: 'object',
                    dynamic: true,
                    properties: {
                      system: {
                        properties: {
                          memory: {
                            properties: {
                              total_bytes: { type: 'long' },
                              used_bytes: { type: 'long' },
                              free_bytes: { type: 'long' },
                              available_bytes: { type: 'long' },
                              buffers_bytes: { type: 'long' },
                              cached_bytes: { type: 'long' },
                              swap_total_bytes: { type: 'long' },
                              swap_free_bytes: { type: 'long' },
                              swap_used_bytes: { type: 'long' },
                              used_percent: { type: 'float' },
                            },
                          },
                          cpu: {
                            properties: {
                              total_pct: { type: 'float' },
                              user_pct: { type: 'float' },
                              system_pct: { type: 'float' },
                              idle_pct: { type: 'float' },
                              iowait_pct: { type: 'float' },
                              steal_pct: { type: 'float' },
                              cores: { type: 'integer' },
                            },
                          },
                        },
                      },
                      process: {
                        properties: {
                          pid: { type: 'integer' },
                          ppid: { type: 'integer' },
                          name: { type: 'keyword' },
                          executable: { type: 'keyword' },
                          command_line: { type: 'keyword' },
                          cpu_pct: { type: 'float' },
                          state: { type: 'keyword' },
                          start_time: { type: 'date' },
                        },
                      },
                      network: {
                        properties: {
                          type: { type: 'keyword' },
                          transport: { type: 'keyword' },
                          direction: { type: 'keyword' },
                        },
                      },
                      source: {
                        properties: {
                          ip: { type: 'ip' },
                          port: { type: 'integer' },
                        },
                      },
                      destination: {
                        properties: {
                          ip: { type: 'ip' },
                          port: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
          });
          logger.info(`Created telemetry index [${indexName}]`);
        }

        // Bulk-index all events
        const bulkBody: Array<Record<string, unknown>> = [];
        for (const evt of payload.events) {
          bulkBody.push({ index: { _index: indexName, _id: evt.id } });
          bulkBody.push({
            ...evt,
            // Ensure the agent.id in the document matches the envelope
            'agent.id': payload.agent_id,
            indexed_at: new Date().toISOString(),
          });
        }

        const bulkResponse = await opensearchClient.bulk({ body: bulkBody });

        if (bulkResponse.body.errors) {
          const failedItems = bulkResponse.body.items.filter(
            (item: any) => {
              const action = item.index || item.create || item.update || item.delete;
              return action?.error;
            }
          );
          logger.warn(
            `Bulk index to [${indexName}]: ${failedItems.length}/${payload.events.length} events failed`
          );
        }

        const indexed = payload.events.length;
        logger.debug(
          `Indexed ${indexed} telemetry events from agent [${payload.agent_id}] into [${indexName}]`
        );

        const body: ControlPlaneTelemetryResponse = {
          indexed,
          message: `${indexed} events indexed into ${indexName}`,
        };

        return response.ok({ body });
      } catch (err) {
        logger.error(`Failed to index telemetry events: ${err}`);
        return response.customError({
          statusCode: 502,
          body: {
            message: `Failed to index telemetry events: ${err}`,
          },
        });
      }
    }
  );
}
