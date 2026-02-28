/*
 * Installs a pre-built index-pattern, visualizations, and dashboard
 * into the Dashboards saved-objects store so the "XDR Agent Telemetry"
 * dashboard is ready out-of-the-box when the plugin starts.
 *
 * Called once from plugin.start().  Uses overwrite:true so restarts
 * always refresh to the latest definition.
 */

import { ISavedObjectsRepository, Logger } from '../../../src/core/server';

// ── Stable IDs (deterministic so overwrite works) ───────────────────────────
const INDEX_PATTERN_ID = 'xdr-agent-telemetry';
const VIS_TOTAL_EVENTS = 'xdr-tel-vis-total-events';
const VIS_ACTIVE_AGENTS = 'xdr-tel-vis-active-agents';
const VIS_AVG_MEMORY = 'xdr-tel-vis-avg-memory';
const VIS_PROCESS_EVENTS = 'xdr-tel-vis-process-events';
const VIS_NETWORK_EVENTS = 'xdr-tel-vis-network-events';
const VIS_EVENT_TYPE_PIE = 'xdr-tel-vis-event-type-pie';
const VIS_MEMORY_TIMELINE = 'xdr-tel-vis-memory-timeline';
const VIS_RECENT_EVENTS = 'xdr-tel-vis-recent-events';
const DASHBOARD_ID = 'xdr-agent-telemetry-dashboard';

// ── Helpers ─────────────────────────────────────────────────────────────────
const searchSource = (indexPatternId: string, query = '') =>
  JSON.stringify({
    index: indexPatternId,
    query: { query, language: 'kuery' },
    filter: [],
  });

const metricVis = (
  title: string,
  aggField: string | null,
  aggType: 'count' | 'cardinality' | 'avg',
  customLabel: string,
  filterQuery?: { query: string; language: string }
) => {
  const aggs: any[] = [];

  if (aggType === 'count') {
    aggs.push({
      id: '1',
      enabled: true,
      type: 'count',
      schema: 'metric',
      params: { customLabel },
    });
  } else {
    aggs.push({
      id: '1',
      enabled: true,
      type: aggType,
      schema: 'metric',
      params: { field: aggField, customLabel },
    });
  }

  return JSON.stringify({
    title,
    type: 'metric',
    params: {
      addTooltip: true,
      addLegend: false,
      type: 'metric',
      metric: {
        percentageMode: false,
        useRanges: false,
        colorSchema: 'Green to Red',
        metricColorMode: 'None',
        colorsRange: [{ from: 0, to: 10000 }],
        labels: { show: true },
        style: { bgFill: '#000', bgColor: false, labelColor: false, subText: '', fontSize: 60 },
      },
    },
    aggs,
  });
};

// ── Saved Objects ───────────────────────────────────────────────────────────

function buildSavedObjects() {
  const indexPattern = {
    type: 'index-pattern',
    id: INDEX_PATTERN_ID,
    attributes: {
      title: '.xdr-agent-telemetry-*',
      timeFieldName: '@timestamp',
      fields: '[]', // auto-discovered on first use
    },
    references: [],
  };

  // 1 — Total events (count)
  const visTotalEvents = {
    type: 'visualization',
    id: VIS_TOTAL_EVENTS,
    attributes: {
      title: '[XDR] Total Telemetry Events',
      visState: metricVis(
        '[XDR] Total Telemetry Events',
        null,
        'count',
        'Total Events'
      ),
      uiStateJSON: '{}',
      description: 'Count of all xdr-agent telemetry events',
      version: 1,
      kibanaSavedObjectMeta: { searchSourceJSON: searchSource(INDEX_PATTERN_ID) },
    },
    references: [],
  };

  // 2 — Active agents (cardinality of agent.id)
  const visActiveAgents = {
    type: 'visualization',
    id: VIS_ACTIVE_AGENTS,
    attributes: {
      title: '[XDR] Active Agents',
      visState: metricVis(
        '[XDR] Active Agents',
        'agent.id',
        'cardinality',
        'Active Agents'
      ),
      uiStateJSON: '{}',
      description: 'Unique agent count in the selected time range',
      version: 1,
      kibanaSavedObjectMeta: { searchSourceJSON: searchSource(INDEX_PATTERN_ID) },
    },
    references: [],
  };

  // 3 — Average memory used %
  const visAvgMemory = {
    type: 'visualization',
    id: VIS_AVG_MEMORY,
    attributes: {
      title: '[XDR] Avg Memory Used %',
      visState: JSON.stringify({
        title: '[XDR] Avg Memory Used %',
        type: 'gauge',
        params: {
          type: 'gauge',
          addTooltip: true,
          addLegend: true,
          isDisplayWarning: false,
          gauge: {
            verticalSplit: false,
            extendRange: true,
            percentageMode: false,
            gaugeType: 'Arc',
            gaugeColorMode: 'Labels',
            colorsRange: [
              { from: 0, to: 50 },
              { from: 50, to: 75 },
              { from: 75, to: 100 },
            ],
            invertColors: false,
            labels: { show: true, color: 'black' },
            scale: { show: true, labels: false, color: '#333' },
            type: 'meter',
            style: {
              bgWidth: 0.9,
              width: 0.9,
              mask: false,
              bgMask: false,
              maskBars: 50,
              bgFill: '#eee',
              bgColor: false,
              subText: '',
              fontSize: 60,
            },
            minAngle: 0,
            maxAngle: 6.283,
            alignment: 'automatic',
          },
        },
        aggs: [
          {
            id: '1',
            enabled: true,
            type: 'avg',
            schema: 'metric',
            params: { field: 'payload.system.memory.used_percent', customLabel: 'Avg Memory %' },
          },
        ],
      }),
      uiStateJSON: '{}',
      description: 'Average memory used percentage across all agents (system.memory events)',
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: searchSource(INDEX_PATTERN_ID, 'event.type: "system.memory"'),
      },
    },
    references: [],
  };

  // 4 — Process events count
  const visProcessEvents = {
    type: 'visualization',
    id: VIS_PROCESS_EVENTS,
    attributes: {
      title: '[XDR] Process Events',
      visState: metricVis('[XDR] Process Events', null, 'count', 'Process Events'),
      uiStateJSON: '{}',
      description: 'Count of process.start and process.end events',
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: searchSource(
          INDEX_PATTERN_ID,
          'event.type: "process.start" or event.type: "process.end"'
        ),
      },
    },
    references: [],
  };

  // 5 — Network events count
  const visNetworkEvents = {
    type: 'visualization',
    id: VIS_NETWORK_EVENTS,
    attributes: {
      title: '[XDR] Network Events',
      visState: metricVis('[XDR] Network Events', null, 'count', 'Network Events'),
      uiStateJSON: '{}',
      description: 'Count of network.connection_opened and network.connection_closed events',
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: searchSource(
          INDEX_PATTERN_ID,
          'event.type: "network.connection_opened" or event.type: "network.connection_closed"'
        ),
      },
    },
    references: [],
  };

  // 6 — Event type breakdown (pie chart)
  const visEventTypePie = {
    type: 'visualization',
    id: VIS_EVENT_TYPE_PIE,
    attributes: {
      title: '[XDR] Event Type Breakdown',
      visState: JSON.stringify({
        title: '[XDR] Event Type Breakdown',
        type: 'pie',
        params: {
          type: 'pie',
          addTooltip: true,
          addLegend: true,
          legendPosition: 'right',
          isDonut: true,
          labels: { show: true, values: true, last_level: true, truncate: 100 },
        },
        aggs: [
          { id: '1', enabled: true, type: 'count', schema: 'metric', params: {} },
          {
            id: '2',
            enabled: true,
            type: 'terms',
            schema: 'segment',
            params: {
              field: 'event.type',
              size: 10,
              order: 'desc',
              orderBy: '1',
              otherBucket: false,
              otherBucketLabel: 'Other',
              missingBucket: false,
              missingBucketLabel: 'Missing',
            },
          },
        ],
      }),
      uiStateJSON: '{}',
      description: 'Breakdown of telemetry events by event.type',
      version: 1,
      kibanaSavedObjectMeta: { searchSourceJSON: searchSource(INDEX_PATTERN_ID) },
    },
    references: [],
  };

  // 7 — Memory usage over time (area chart)
  const visMemoryTimeline = {
    type: 'visualization',
    id: VIS_MEMORY_TIMELINE,
    attributes: {
      title: '[XDR] Memory Usage Over Time',
      visState: JSON.stringify({
        title: '[XDR] Memory Usage Over Time',
        type: 'area',
        params: {
          type: 'area',
          grid: { categoryLines: false, style: { color: '#eee' } },
          categoryAxes: [
            {
              id: 'CategoryAxis-1',
              type: 'category',
              position: 'bottom',
              show: true,
              style: {},
              scale: { type: 'linear' },
              labels: { show: true, truncate: 100, filter: true },
              title: {},
            },
          ],
          valueAxes: [
            {
              id: 'ValueAxis-1',
              name: 'LeftAxis-1',
              type: 'value',
              position: 'left',
              show: true,
              style: {},
              scale: { type: 'linear', mode: 'normal' },
              labels: { show: true, rotate: 0, filter: false, truncate: 100 },
              title: { text: 'Memory Used %' },
            },
          ],
          seriesParams: [
            {
              show: true,
              type: 'area',
              mode: 'normal',
              data: { label: 'Avg Memory %', id: '1' },
              drawLinesBetweenPoints: true,
              showCircles: true,
              interpolate: 'linear',
              lineWidth: 2,
              valueAxis: 'ValueAxis-1',
            },
          ],
          addTooltip: true,
          addLegend: true,
          legendPosition: 'top',
          times: [],
          addTimeMarker: false,
        },
        aggs: [
          {
            id: '1',
            enabled: true,
            type: 'avg',
            schema: 'metric',
            params: { field: 'payload.system.memory.used_percent', customLabel: 'Avg Memory %' },
          },
          {
            id: '2',
            enabled: true,
            type: 'date_histogram',
            schema: 'segment',
            params: {
              field: '@timestamp',
              interval: 'auto',
              min_doc_count: 1,
              extended_bounds: {},
            },
          },
          {
            id: '3',
            enabled: true,
            type: 'terms',
            schema: 'group',
            params: {
              field: 'agent.id',
              size: 20,
              order: 'desc',
              orderBy: '1',
              otherBucket: false,
              missingBucket: false,
            },
          },
        ],
      }),
      uiStateJSON: '{}',
      description: 'Memory used % over time, broken down by agent',
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: searchSource(INDEX_PATTERN_ID, 'event.type: "system.memory"'),
      },
    },
    references: [],
  };

  // 8 — Recent events table (saved search style via data_table vis)
  const visRecentEvents = {
    type: 'visualization',
    id: VIS_RECENT_EVENTS,
    attributes: {
      title: '[XDR] Recent Telemetry Events',
      visState: JSON.stringify({
        title: '[XDR] Recent Telemetry Events',
        type: 'table',
        params: {
          perPage: 20,
          showPartialRows: false,
          showMetricsAtAllLevels: false,
          sort: { columnIndex: null, direction: null },
          showTotal: false,
          totalFunc: 'sum',
          percentageCol: '',
        },
        aggs: [
          { id: '1', enabled: true, type: 'count', schema: 'metric', params: {} },
          {
            id: '2',
            enabled: true,
            type: 'date_histogram',
            schema: 'bucket',
            params: {
              field: '@timestamp',
              interval: 'auto',
              min_doc_count: 1,
              extended_bounds: {},
              customLabel: 'Timestamp',
            },
          },
          {
            id: '3',
            enabled: true,
            type: 'terms',
            schema: 'bucket',
            params: {
              field: 'event.type',
              size: 20,
              order: 'desc',
              orderBy: '1',
              customLabel: 'Event Type',
            },
          },
          {
            id: '4',
            enabled: true,
            type: 'terms',
            schema: 'bucket',
            params: {
              field: 'host.hostname',
              size: 50,
              order: 'desc',
              orderBy: '1',
              customLabel: 'Hostname',
            },
          },
        ],
      }),
      uiStateJSON: JSON.stringify({ vis: { params: { sort: { columnIndex: 0, direction: 'desc' } } } }),
      description: 'Table of recent telemetry events by time, type and host',
      version: 1,
      kibanaSavedObjectMeta: { searchSourceJSON: searchSource(INDEX_PATTERN_ID) },
    },
    references: [],
  };

  // ── Dashboard ─────────────────────────────────────────────────────────────
  // Grid layout:  48 columns total
  // Row 0: metrics row (5 panels, each w=~9-10, h=8)
  // Row 8: pie (w=16 h=14) + gauge (w=16 h=14) + memory timeline (w=16 h=14)
  // Row 22: recent events table (w=48 h=16)

  const panels = [
    { gridData: { x: 0, y: 0, w: 10, h: 8, i: '1' }, panelIndex: '1', panelRefName: 'panel_0' },
    { gridData: { x: 10, y: 0, w: 10, h: 8, i: '2' }, panelIndex: '2', panelRefName: 'panel_1' },
    { gridData: { x: 20, y: 0, w: 10, h: 8, i: '3' }, panelIndex: '3', panelRefName: 'panel_2' },
    { gridData: { x: 30, y: 0, w: 9, h: 8, i: '4' }, panelIndex: '4', panelRefName: 'panel_3' },
    { gridData: { x: 39, y: 0, w: 9, h: 8, i: '5' }, panelIndex: '5', panelRefName: 'panel_4' },
    { gridData: { x: 0, y: 8, w: 16, h: 14, i: '6' }, panelIndex: '6', panelRefName: 'panel_5' },
    { gridData: { x: 16, y: 8, w: 16, h: 14, i: '7' }, panelIndex: '7', panelRefName: 'panel_6' },
    { gridData: { x: 32, y: 8, w: 16, h: 14, i: '8' }, panelIndex: '8', panelRefName: 'panel_7' },
    { gridData: { x: 0, y: 22, w: 48, h: 16, i: '9' }, panelIndex: '9', panelRefName: 'panel_8' },
  ];

  const dashboard = {
    type: 'dashboard',
    id: DASHBOARD_ID,
    attributes: {
      title: 'XDR Agent Telemetry',
      hits: 0,
      description:
        'Out-of-the-box telemetry dashboard for xdr-agent: memory, process, and network events.',
      panelsJSON: JSON.stringify(
        panels.map((p) => ({
          embeddableConfig: {},
          gridData: p.gridData,
          panelIndex: p.panelIndex,
          version: '2.19.0',
          panelRefName: p.panelRefName,
        }))
      ),
      optionsJSON: JSON.stringify({ hidePanelTitles: false, useMargins: true }),
      version: 1,
      timeRestore: true,
      timeTo: 'now',
      timeFrom: 'now-24h',
      refreshInterval: { pause: false, value: 30000 },
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({
          query: { language: 'kuery', query: '' },
          filter: [],
        }),
      },
    },
    references: [
      { name: 'panel_0', type: 'visualization', id: VIS_TOTAL_EVENTS },
      { name: 'panel_1', type: 'visualization', id: VIS_ACTIVE_AGENTS },
      { name: 'panel_2', type: 'visualization', id: VIS_AVG_MEMORY },
      { name: 'panel_3', type: 'visualization', id: VIS_PROCESS_EVENTS },
      { name: 'panel_4', type: 'visualization', id: VIS_NETWORK_EVENTS },
      { name: 'panel_5', type: 'visualization', id: VIS_EVENT_TYPE_PIE },
      { name: 'panel_6', type: 'visualization', id: VIS_MEMORY_TIMELINE },
      { name: 'panel_7', type: 'visualization', id: VIS_MEMORY_TIMELINE }, // intentional: timeline repeated or use gauge
      { name: 'panel_8', type: 'visualization', id: VIS_RECENT_EVENTS },
    ],
  };

  // Fix panel_7 — should be the gauge, not timeline repeated
  dashboard.references[7] = { name: 'panel_7', type: 'visualization', id: VIS_AVG_MEMORY };

  // Rearrange: row 1 = metrics, row 2 = pie + memory-timeline + gauge, row 3 = table
  // Actually let's fix the layout so gauge is up top and memory-timeline fills middle row better
  // Row 0: total-events | active-agents | process-events | network-events | avg-memory-gauge
  // Row 8: event-type-pie (left) | memory-timeline (right, wider)
  // Row 22: recent events table (full width)

  dashboard.references = [
    { name: 'panel_0', type: 'visualization', id: VIS_TOTAL_EVENTS },
    { name: 'panel_1', type: 'visualization', id: VIS_ACTIVE_AGENTS },
    { name: 'panel_2', type: 'visualization', id: VIS_PROCESS_EVENTS },
    { name: 'panel_3', type: 'visualization', id: VIS_NETWORK_EVENTS },
    { name: 'panel_4', type: 'visualization', id: VIS_AVG_MEMORY },
    { name: 'panel_5', type: 'visualization', id: VIS_EVENT_TYPE_PIE },
    { name: 'panel_6', type: 'visualization', id: VIS_MEMORY_TIMELINE },
    { name: 'panel_7', type: 'visualization', id: VIS_RECENT_EVENTS },
  ];

  dashboard.attributes.panelsJSON = JSON.stringify([
    // Row 0 — metric cards
    { embeddableConfig: {}, gridData: { x: 0, y: 0, w: 10, h: 8, i: '1' }, panelIndex: '1', version: '2.19.0', panelRefName: 'panel_0' },
    { embeddableConfig: {}, gridData: { x: 10, y: 0, w: 10, h: 8, i: '2' }, panelIndex: '2', version: '2.19.0', panelRefName: 'panel_1' },
    { embeddableConfig: {}, gridData: { x: 20, y: 0, w: 10, h: 8, i: '3' }, panelIndex: '3', version: '2.19.0', panelRefName: 'panel_2' },
    { embeddableConfig: {}, gridData: { x: 30, y: 0, w: 9, h: 8, i: '4' }, panelIndex: '4', version: '2.19.0', panelRefName: 'panel_3' },
    { embeddableConfig: {}, gridData: { x: 39, y: 0, w: 9, h: 8, i: '5' }, panelIndex: '5', version: '2.19.0', panelRefName: 'panel_4' },
    // Row 8 — pie chart + memory timeline
    { embeddableConfig: {}, gridData: { x: 0, y: 8, w: 18, h: 14, i: '6' }, panelIndex: '6', version: '2.19.0', panelRefName: 'panel_5' },
    { embeddableConfig: {}, gridData: { x: 18, y: 8, w: 30, h: 14, i: '7' }, panelIndex: '7', version: '2.19.0', panelRefName: 'panel_6' },
    // Row 22 — events table
    { embeddableConfig: {}, gridData: { x: 0, y: 22, w: 48, h: 16, i: '8' }, panelIndex: '8', version: '2.19.0', panelRefName: 'panel_7' },
  ]);

  return [
    indexPattern,
    visTotalEvents,
    visActiveAgents,
    visAvgMemory,
    visProcessEvents,
    visNetworkEvents,
    visEventTypePie,
    visMemoryTimeline,
    visRecentEvents,
    dashboard,
  ];
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function installTelemetryDashboard(
  repo: ISavedObjectsRepository,
  logger: Logger
): Promise<void> {
  const objects = buildSavedObjects();

  try {
    const result = await repo.bulkCreate(objects as any[], { overwrite: true });
    const errors = result.saved_objects.filter((o: any) => o.error);
    if (errors.length > 0) {
      logger.warn(
        `xdr_manager: telemetry dashboard install had ${errors.length} error(s): ` +
          errors.map((e: any) => `${e.type}/${e.id}: ${e.error.message}`).join('; ')
      );
    } else {
      logger.info(
        `xdr_manager: installed telemetry dashboard (${result.saved_objects.length} saved objects)`
      );
    }
  } catch (err) {
    logger.error(`xdr_manager: failed to install telemetry dashboard: ${err}`);
  }
}
