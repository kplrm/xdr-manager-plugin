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

        // Deduplicate by process name; keep most-recent hit per name, merging
        // zero/empty fields from older hits.  All enriched fields including
        // cpu.pct are now present directly on process.start and process.end
        // events — there is no separate process.cpu event type.
        const byName = new Map<string, TelemetryProcessEntry>();
        let processStarts = 0;
        let processEnds = 0;

        for (const hit of hits) {
          const src = hit._source;
          const proc = src?.payload?.process;
          if (!proc) continue;

          const eventType: string = src['event.type'] ?? '';
          if (eventType === 'process.start') processStarts++;
          else if (eventType === 'process.end') processEnds++;

          const name: string = proc.name ?? 'unknown';
          if (!byName.has(name)) {
            byName.set(name, {
              name,
              pid:               proc.pid              ?? 0,
              ppid:              proc.ppid             ?? 0,
              cpu_pct:           proc.cpu?.pct         ?? 0,
              executable:        proc.executable       ?? '',
              command_line:      proc.command_line     ?? '',
              args:              Array.isArray(proc.args) ? proc.args : [],
              working_directory: proc.working_directory ?? '',
              state:             proc.state            ?? '',
              entity_id:         proc.entity_id        ?? '',
              user_id:           proc.user?.id         ?? 0,
              user_name:         proc.user?.name       ?? '',
              group_id:          proc.group?.id        ?? 0,
              group_name:        proc.group?.name      ?? '',
              cap_eff:           proc.cap_eff          ?? '',
              exe_sha256:        proc.hash?.sha256     ?? '',
              threads_count:     proc.threads?.count   ?? 0,
              fd_count:          proc.fd_count         ?? 0,
              mem_rss_bytes:     proc.memory?.rss      ?? 0,
              mem_vms_bytes:     proc.memory?.vms      ?? 0,
              io_read_bytes:     proc.io?.read_bytes   ?? 0,
              io_write_bytes:    proc.io?.write_bytes  ?? 0,
              parent_pid:        proc.parent?.pid      ?? 0,
              parent_name:       proc.parent?.name     ?? '',
              event_type:        eventType,
              timestamp:         src['@timestamp'],
            });
          } else {
            // Merge: fill in zero/empty fields from older hits of the same process
            const e = byName.get(name)!;
            if (e.cpu_pct === 0 && (proc.cpu?.pct ?? 0) > 0)           e.cpu_pct           = proc.cpu.pct;
            if (!e.user_name    && proc.user?.name)                    e.user_name          = proc.user.name;
            if (!e.group_name   && proc.group?.name)                   e.group_name         = proc.group.name;
            if (e.mem_rss_bytes   === 0 && (proc.memory?.rss ?? 0) > 0)  e.mem_rss_bytes   = proc.memory.rss;
            if (e.mem_vms_bytes   === 0 && (proc.memory?.vms ?? 0) > 0)  e.mem_vms_bytes   = proc.memory.vms;
            if (e.io_read_bytes   === 0 && (proc.io?.read_bytes  ?? 0) > 0) e.io_read_bytes  = proc.io.read_bytes;
            if (e.io_write_bytes  === 0 && (proc.io?.write_bytes ?? 0) > 0) e.io_write_bytes = proc.io.write_bytes;
            if (!e.exe_sha256    && proc.hash?.sha256)                 e.exe_sha256         = proc.hash.sha256;
            if (!e.state         && proc.state)                        e.state              = proc.state;
            if (!e.working_directory && proc.working_directory)        e.working_directory  = proc.working_directory;
            if (e.threads_count === 0 && (proc.threads?.count ?? 0) > 0) e.threads_count   = proc.threads.count;
            if (e.fd_count      === 0 && (proc.fd_count ?? 0) > 0)    e.fd_count           = proc.fd_count;
          }
        }

        const processes = Array.from(byName.values()).sort(
          (a, b) => b.cpu_pct - a.cpu_pct
        );

        const body: TelemetryProcessResponse = {
          processes,
          total_events,
          process_starts: processStarts,
          process_ends: processEnds,
        };
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
