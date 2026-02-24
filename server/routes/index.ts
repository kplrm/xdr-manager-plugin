import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../src/core/server';
import {
  AgentStatus,
  ListAgentsResponse,
  RunActionRequest,
  RunActionResponse,
  UpsertPolicyRequest,
  UpsertPolicyResponse,
  XdrAction,
  XdrAgent,
  XdrPolicy,
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

const agents: XdrAgent[] = [
  {
    id: 'agent-001',
    name: 'edge-node-01',
    policyId: 'default-endpoint',
    status: 'healthy',
    lastSeen: new Date().toISOString(),
    tags: ['linux', 'production'],
    version: '1.0.0',
  },
  {
    id: 'agent-002',
    name: 'payments-node-03',
    policyId: 'high-security-linux',
    status: 'degraded',
    lastSeen: new Date(Date.now() - 120_000).toISOString(),
    tags: ['linux', 'payments'],
    version: '1.0.0',
  },
];

const actionToStatusMap: Record<XdrAction, AgentStatus> = {
  restart: 'healthy',
  isolate: 'offline',
  upgrade: 'healthy',
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

export function defineRoutes(router: IRouter) {
  router.get(
    {
      path: '/api/xdr_manager/agents',
      validate: false,
    },
    async (_context, _request, response) => {
      const body: ListAgentsResponse = {
        agents,
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
          name: schema.string({ minLength: 1 }),
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

      const newAgent: XdrAgent = {
        id: `agent-${Date.now()}`,
        name: request.body.name,
        policyId: request.body.policyId,
        status: 'healthy',
        lastSeen: new Date().toISOString(),
        tags: request.body.tags ?? [],
        version: '1.0.0',
      };

      agents.unshift(newAgent);

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

      if (agents.some((agent) => agent.policyId === request.params.id)) {
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
      const agent = agents.find((item) => item.id === request.params.id);

      if (!agent) {
        return response.notFound({
          body: `Agent [${request.params.id}] not found`,
        });
      }

      const { action } = request.body as RunActionRequest;

      agent.status = actionToStatusMap[action];
      agent.lastSeen = new Date().toISOString();
      if (action === 'upgrade') {
        agent.version = bumpVersion(agent.version);
      }

      const body: RunActionResponse = {
        agent,
        message: `Action [${action}] completed for ${agent.name}.`,
      };

      return response.ok({ body });
    }
  );
}
