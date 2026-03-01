/*
 * Server-side routes that query the .xdr-agent-telemetry-* indices and
 * return pre-processed data for the in-app Telemetry dashboard tabs
 * (Host, Process, Network).
 */

import { IRouter, Logger } from '../../../../src/core/server';
import {
  TelemetryHostResponse,
  TelemetryHostMetrics,
  TelemetryHostTimelinePoint,
  TelemetryProcessResponse,
  TelemetryProcessEntry,
  TelemetryNetworkResponse,
  TelemetryNetworkConnection,
} from '../../common';

const TELEMETRY_INDEX = '.xdr-agent-telemetry-*';

export function defineTelemetryRoutes(router: IRouter, logger: Logger): void {
  // ── GET /api/xdr_manager/telemetry/host ─────────────────────────────────
  // Returns the latest host-level metrics snapshot plus a chronological
  // timeline (up to 200 data-points) for CPU and memory sparklines.

  router.get(
    {
      path: '/api/xdr_manager/telemetry/host',
      validate: false,
    },
    async (context, _request, response) => {
      const client = context.core.opensearch.client.asInternalUser;

      try {
        const result = await client.search({
          index: TELEMETRY_INDEX,
          body: {
            query: {
              bool: {
                filter: [
                  { term: { 'event.category': 'host' } },
                  { range: { '@timestamp': { gte: 'now-24h', lte: 'now' } } },
                ],
              },
            },
            sort: [{ '@timestamp': { order: 'desc' } }],
            size: 200,
          },
        });

        const hits = (result.body.hits?.hits ?? []) as any[];

        let latest: TelemetryHostMetrics | null = null;
        const timeline: TelemetryHostTimelinePoint[] = [];

        for (const hit of hits) {
          const src = hit._source;
          const system = src?.payload?.system;
          if (!system) continue;

          timeline.push({
            timestamp: src['@timestamp'],
            cpu_total_pct: system.cpu?.total?.pct ?? 0,
            cpu_user_pct: system.cpu?.user?.pct ?? 0,
            cpu_system_pct: system.cpu?.system?.pct ?? 0,
            cpu_iowait_pct: system.cpu?.iowait?.pct ?? 0,
            memory_used_pct: system.memory?.used?.pct ?? 0,
          });

          if (!latest) {
            latest = {
              cpu: {
                cores: system.cpu?.cores ?? 0,
                total_pct: system.cpu?.total?.pct ?? 0,
                user_pct: system.cpu?.user?.pct ?? 0,
                system_pct: system.cpu?.system?.pct ?? 0,
                idle_pct: system.cpu?.idle?.pct ?? 0,
                iowait_pct: system.cpu?.iowait?.pct ?? 0,
                steal_pct: system.cpu?.steal?.pct ?? 0,
              },
              memory: {
                total: system.memory?.total ?? 0,
                used_bytes: system.memory?.used?.bytes ?? 0,
                used_pct: system.memory?.used?.pct ?? 0,
                free: system.memory?.free ?? 0,
                actual_free: system.memory?.actual?.free ?? 0,
                cached: system.memory?.cached ?? 0,
                buffer: system.memory?.buffer ?? 0,
                swap_total: system.memory?.swap?.total ?? 0,
                swap_free: system.memory?.swap?.free ?? 0,
                swap_used_bytes: system.memory?.swap?.used?.bytes ?? 0,
              },
              timestamp: src['@timestamp'],
            };
          }
        }

        // Reverse so the array is chronological (oldest → newest)
        timeline.reverse();

        const body: TelemetryHostResponse = { latest, timeline };
        return response.ok({ body });
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.meta?.statusCode === 404) {
          return response.ok({ body: { latest: null, timeline: [] } });
        }
        logger.error(`Failed to query host telemetry: ${err}`);
        return response.customError({
          statusCode: 502,
          body: { message: `Failed to query host telemetry: ${err}` },
        });
      }
    }
  );

  // ── GET /api/xdr_manager/telemetry/processes ────────────────────────────
  // Returns unique processes (deduplicated by name, most-recent reading)
  // sorted by CPU usage descending.

  router.get(
    {
      path: '/api/xdr_manager/telemetry/processes',
      validate: false,
    },
    async (context, _request, response) => {
      const client = context.core.opensearch.client.asInternalUser;

      try {
        const result = await client.search({
          index: TELEMETRY_INDEX,
          body: {
            query: {
              bool: {
                filter: [
                  { term: { 'event.category': 'process' } },
                  { range: { '@timestamp': { gte: 'now-24h', lte: 'now' } } },
                ],
              },
            },
            sort: [{ '@timestamp': { order: 'desc' } }],
            size: 500,
          },
        });

        const hits = (result.body.hits?.hits ?? []) as any[];
        const totalHits = result.body.hits?.total;
        const total_events =
          typeof totalHits === 'number' ? totalHits : totalHits?.value ?? 0;

        // Deduplicate: keep the most recent reading per process name
        const byName = new Map<string, TelemetryProcessEntry>();
        for (const hit of hits) {
          const src = hit._source;
          const proc = src?.payload?.process;
          if (!proc) continue;

          const name = proc.name ?? 'unknown';
          if (!byName.has(name)) {
            byName.set(name, {
              name,
              pid: proc.pid ?? 0,
              cpu_pct: proc.cpu?.pct ?? 0,
              executable: proc.executable ?? '',
              command_line: proc.command_line ?? '',
              timestamp: src['@timestamp'],
            });
          }
        }

        const processes = Array.from(byName.values()).sort(
          (a, b) => b.cpu_pct - a.cpu_pct
        );

        const body: TelemetryProcessResponse = { processes, total_events };
        return response.ok({ body });
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.meta?.statusCode === 404) {
          return response.ok({ body: { processes: [], total_events: 0 } });
        }
        logger.error(`Failed to query process telemetry: ${err}`);
        return response.customError({
          statusCode: 502,
          body: { message: `Failed to query process telemetry: ${err}` },
        });
      }
    }
  );

  // ── GET /api/xdr_manager/telemetry/network ──────────────────────────────
  // Returns recent network connections plus summary counts and protocol /
  // state distributions.

  router.get(
    {
      path: '/api/xdr_manager/telemetry/network',
      validate: false,
    },
    async (context, _request, response) => {
      const client = context.core.opensearch.client.asInternalUser;

      try {
        const result = await client.search({
          index: TELEMETRY_INDEX,
          body: {
            query: {
              bool: {
                filter: [
                  { term: { 'event.category': 'network' } },
                  { range: { '@timestamp': { gte: 'now-24h', lte: 'now' } } },
                ],
              },
            },
            sort: [{ '@timestamp': { order: 'desc' } }],
            size: 500,
          },
        });

        const hits = (result.body.hits?.hits ?? []) as any[];
        const connections: TelemetryNetworkConnection[] = [];
        const protocols: Record<string, number> = {};
        const states: Record<string, number> = {};
        let inbound = 0;
        let outbound = 0;

        for (const hit of hits) {
          const src = hit._source;
          const net = src?.payload?.network;
          if (!net) continue;

          const direction = net.direction ?? 'unknown';
          const protocol = net.protocol ?? net.transport ?? 'unknown';
          const state = net.state ?? 'unknown';

          connections.push({
            direction,
            local_addr: net.local_addr ?? '',
            local_port: net.local_port ?? 0,
            remote_addr: net.remote_addr ?? '',
            remote_port: net.remote_port ?? 0,
            protocol,
            state,
            transport: net.transport ?? '',
            timestamp: src['@timestamp'],
            event_type: src['event.type'] ?? '',
          });

          protocols[protocol] = (protocols[protocol] ?? 0) + 1;
          states[state] = (states[state] ?? 0) + 1;

          if (direction === 'inbound') inbound++;
          else if (direction === 'outbound') outbound++;
        }

        const body: TelemetryNetworkResponse = {
          connections,
          summary: { total: connections.length, inbound, outbound },
          protocols,
          states,
        };
        return response.ok({ body });
      } catch (err: any) {
        if (err?.statusCode === 404 || err?.meta?.statusCode === 404) {
          return response.ok({
            body: {
              connections: [],
              summary: { total: 0, inbound: 0, outbound: 0 },
              protocols: {},
              states: {},
            },
          });
        }
        logger.error(`Failed to query network telemetry: ${err}`);
        return response.customError({
          statusCode: 502,
          body: { message: `Failed to query network telemetry: ${err}` },
        });
      }
    }
  );
}
