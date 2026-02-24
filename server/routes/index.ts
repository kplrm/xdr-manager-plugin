import { schema } from '@osd/config-schema';
import { IRouter } from '../../../../src/core/server';
import {
  AgentStatus,
  ListAgentsResponse,
  RunActionRequest,
  RunActionResponse,
  XdrAction,
  XdrAgent,
  XdrPolicy,
} from '../../common';

const policies: XdrPolicy[] = [
  {
    id: 'default-endpoint',
    name: 'Default Endpoint Policy',
    description: 'Baseline telemetry and malware prevention.',
  },
  {
    id: 'high-security-linux',
    name: 'High Security Linux',
    description: 'Hardening profile for production Linux workloads.',
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
