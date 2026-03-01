/*
 * Installs pre-built index-patterns, visualizations, and THREE dashboards
 * for XDR Agent Telemetry, organised into tab-like views:
 *   - Host   — system CPU & memory metrics
 *   - Process — per-process CPU usage
 *   - Network — connection events, protocol/state distribution
 *
 * Each dashboard carries a markdown "navigation bar" panel at the top whose
 * links point at the other two dashboards, giving users a tab-switching UX
 * inside native OpenSearch Dashboards.
 *
 * Called once from plugin.start().
 */

import { ISavedObjectsRepository, Logger } from '../../../src/core/server';

// ── Stable IDs ──────────────────────────────────────────────────────────────
const INDEX_PATTERN_ID = 'xdr-agent-telemetry';

// Dashboards
const DASH_HOST = 'xdr-agent-telemetry-dashboard';        // reuse original ID
const DASH_PROCESS = 'xdr-agent-telemetry-processes';
const DASH_NETWORK = 'xdr-agent-telemetry-network';

// Markdown navigation visualizations (one per dashboard)
const NAV_HOST = 'xdr-tel-nav-host';
const NAV_PROCESS = 'xdr-tel-nav-process';
const NAV_NETWORK = 'xdr-tel-nav-network';

// Host visualizations
const VIS_HOST_EVENTS = 'xdr-tel-vis-host-events';
const VIS_ACTIVE_AGENTS = 'xdr-tel-vis-active-agents';
const VIS_AVG_MEMORY = 'xdr-tel-vis-avg-memory';
const VIS_AVG_CPU = 'xdr-tel-vis-avg-cpu';
const VIS_SWAP_GAUGE = 'xdr-tel-vis-swap-gauge';
const VIS_DISK_GAUGE = 'xdr-tel-vis-disk-gauge';
const VIS_HOSTNAME_FILTER = 'xdr-tel-vis-hostname-filter';
const VIS_CPU_PER_AGENT = 'xdr-tel-vis-cpu-per-agent';
const VIS_MEMORY_TIMELINE = 'xdr-tel-vis-memory-timeline';
const VIS_CPU_BREAKDOWN = 'xdr-tel-vis-cpu-breakdown';
const VIS_DISKIO = 'xdr-tel-vis-diskio';
const VIS_NETIO = 'xdr-tel-vis-netio';

// Process visualizations
const VIS_PROCESS_EVENTS = 'xdr-tel-vis-process-events';
const VIS_UNIQUE_PROCESSES = 'xdr-tel-vis-unique-processes';
const VIS_CPU_PER_PROCESS = 'xdr-tel-vis-cpu-per-process';
const VIS_PROCESS_TIMELINE = 'xdr-tel-vis-process-timeline';

// Network visualizations
const VIS_NETWORK_EVENTS = 'xdr-tel-vis-network-events';
const VIS_NET_INBOUND = 'xdr-tel-vis-net-inbound';
const VIS_NET_OUTBOUND = 'xdr-tel-vis-net-outbound';
const VIS_NET_PROTOCOL = 'xdr-tel-vis-net-protocol';
const VIS_NET_STATE = 'xdr-tel-vis-net-state';
const VIS_NET_DIRECTION = 'xdr-tel-vis-net-direction';
const VIS_NET_TIMELINE = 'xdr-tel-vis-net-timeline';

// ── Helpers ─────────────────────────────────────────────────────────────────
const ss = (query = '') =>
  JSON.stringify({
    index: INDEX_PATTERN_ID,
    query: { query, language: 'kuery' },
    filter: [],
  });

// Generic Arc gauge (green→yellow→red at standard thresholds)
const gaugeVis = (title: string, field: string, label: string, ranges: Array<{ from: number; to: number }>) =>
  JSON.stringify({
    title,
    type: 'gauge',
    params: {
      type: 'gauge', addTooltip: true, addLegend: false, isDisplayWarning: false,
      gauge: {
        verticalSplit: false, extendRange: true, percentageMode: false,
        gaugeType: 'Arc', gaugeColorMode: 'Labels',
        colorsRange: ranges,
        invertColors: false,
        labels: { show: true, color: 'black' },
        scale: { show: true, labels: false, color: '#333' },
        type: 'meter',
        style: { bgWidth: 0.9, width: 0.9, mask: false, bgMask: false, maskBars: 50, bgFill: '#eee', bgColor: false, subText: '', fontSize: 60 },
        minAngle: 0, maxAngle: 6.283, alignment: 'automatic',
      },
    },
    aggs: [{ id: '1', enabled: true, type: 'avg', schema: 'metric', params: { field, customLabel: label } }],
  });

// Dual-series area chart (two average metrics over time, no group-by split)
const dualAreaVis = (title: string, f1: string, l1: string, f2: string, l2: string, yTitle: string) =>
  JSON.stringify({
    title,
    type: 'area',
    params: {
      type: 'area',
      grid: { categoryLines: false, style: { color: '#eee' } },
      categoryAxes: [{ id: 'CategoryAxis-1', type: 'category', position: 'bottom', show: true, style: {}, scale: { type: 'linear' }, labels: { show: true, truncate: 100, filter: true }, title: {} }],
      valueAxes: [{ id: 'ValueAxis-1', name: 'LeftAxis-1', type: 'value', position: 'left', show: true, style: {}, scale: { type: 'linear', mode: 'normal' }, labels: { show: true, rotate: 0, filter: false, truncate: 100 }, title: { text: yTitle } }],
      seriesParams: [
        { show: true, type: 'area', mode: 'normal', data: { label: l1, id: '1' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, showCircles: true, interpolate: 'linear', lineWidth: 2 },
        { show: true, type: 'area', mode: 'normal', data: { label: l2, id: '2' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, showCircles: true, interpolate: 'linear', lineWidth: 2 },
      ],
      addTooltip: true, addLegend: true, legendPosition: 'top',
      times: [], addTimeMarker: false,
    },
    aggs: [
      { id: '1', enabled: true, type: 'avg', schema: 'metric', params: { field: f1, customLabel: l1 } },
      { id: '2', enabled: true, type: 'avg', schema: 'metric', params: { field: f2, customLabel: l2 } },
      { id: '3', enabled: true, type: 'date_histogram', schema: 'segment', params: { field: '@timestamp', interval: 'auto', min_doc_count: 1, extended_bounds: {} } },
    ],
  });

const metricVis = (
  title: string,
  aggField: string | null,
  aggType: 'count' | 'cardinality' | 'avg',
  customLabel: string
) => {
  const agg: any =
    aggType === 'count'
      ? { id: '1', enabled: true, type: 'count', schema: 'metric', params: { customLabel } }
      : { id: '1', enabled: true, type: aggType, schema: 'metric', params: { field: aggField, customLabel } };

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
    aggs: [agg],
  });
};

const markdownVis = (title: string, md: string) =>
  JSON.stringify({
    title,
    type: 'markdown',
    params: { markdown: md, openLinksInNewTab: false, fontSize: 14 },
    aggs: [],
  });

const areaVis = (title: string, metricField: string, metricLabel: string, groupField: string, yTitle: string) =>
  JSON.stringify({
    title,
    type: 'area',
    params: {
      type: 'area',
      grid: { categoryLines: false, style: { color: '#eee' } },
      categoryAxes: [{
        id: 'CategoryAxis-1', type: 'category', position: 'bottom', show: true, style: {},
        scale: { type: 'linear' }, labels: { show: true, truncate: 100, filter: true }, title: {},
      }],
      valueAxes: [{
        id: 'ValueAxis-1', name: 'LeftAxis-1', type: 'value', position: 'left', show: true, style: {},
        scale: { type: 'linear', mode: 'normal' }, labels: { show: true, rotate: 0, filter: false, truncate: 100 },
        title: { text: yTitle },
      }],
      seriesParams: [{
        show: true, type: 'area', mode: 'normal',
        data: { label: metricLabel, id: '1' },
        drawLinesBetweenPoints: true, showCircles: true, interpolate: 'linear', lineWidth: 2,
        valueAxis: 'ValueAxis-1',
      }],
      addTooltip: true, addLegend: true, legendPosition: 'top',
      times: [], addTimeMarker: false,
    },
    aggs: [
      { id: '1', enabled: true, type: 'avg', schema: 'metric', params: { field: metricField, customLabel: metricLabel } },
      { id: '2', enabled: true, type: 'date_histogram', schema: 'segment', params: { field: '@timestamp', interval: 'auto', min_doc_count: 1, extended_bounds: {} } },
      { id: '3', enabled: true, type: 'terms', schema: 'group', params: { field: groupField, size: 20, order: 'desc', orderBy: '1', otherBucket: false, missingBucket: false } },
    ],
  });

const pieVis = (title: string, termField: string, termLabel: string, topN = 10) =>
  JSON.stringify({
    title,
    type: 'pie',
    params: {
      type: 'pie', addTooltip: true, addLegend: true, legendPosition: 'right',
      isDonut: true, labels: { show: true, values: true, last_level: true, truncate: 100 },
    },
    aggs: [
      { id: '1', enabled: true, type: 'count', schema: 'metric', params: {} },
      { id: '2', enabled: true, type: 'terms', schema: 'segment', params: {
        field: termField, size: topN, order: 'desc', orderBy: '1',
        otherBucket: true, otherBucketLabel: 'Other', missingBucket: false, missingBucketLabel: 'Missing',
        customLabel: termLabel,
      }},
    ],
  });

const countAreaVis = (title: string, yTitle: string) =>
  JSON.stringify({
    title,
    type: 'area',
    params: {
      type: 'area',
      grid: { categoryLines: false, style: { color: '#eee' } },
      categoryAxes: [{
        id: 'CategoryAxis-1', type: 'category', position: 'bottom', show: true, style: {},
        scale: { type: 'linear' }, labels: { show: true, truncate: 100, filter: true }, title: {},
      }],
      valueAxes: [{
        id: 'ValueAxis-1', name: 'LeftAxis-1', type: 'value', position: 'left', show: true, style: {},
        scale: { type: 'linear', mode: 'normal' }, labels: { show: true, rotate: 0, filter: false, truncate: 100 },
        title: { text: yTitle },
      }],
      seriesParams: [{
        show: true, type: 'area', mode: 'normal',
        data: { label: 'Count', id: '1' },
        drawLinesBetweenPoints: true, showCircles: true, interpolate: 'linear', lineWidth: 2,
        valueAxis: 'ValueAxis-1',
      }],
      addTooltip: true, addLegend: false, legendPosition: 'top',
      times: [], addTimeMarker: false,
    },
    aggs: [
      { id: '1', enabled: true, type: 'count', schema: 'metric', params: { customLabel: 'Count' } },
      { id: '2', enabled: true, type: 'date_histogram', schema: 'segment', params: { field: '@timestamp', interval: 'auto', min_doc_count: 1, extended_bounds: {} } },
    ],
  });

// ── Saved Objects ───────────────────────────────────────────────────────────

function vis(id: string, title: string, description: string, visState: string, query = '') {
  return {
    type: 'visualization',
    id,
    attributes: {
      title,
      visState,
      uiStateJSON: '{}',
      description,
      version: 1,
      kibanaSavedObjectMeta: { searchSourceJSON: ss(query) },
    },
    references: [],
  };
}

function dashboard(
  id: string,
  title: string,
  description: string,
  panels: Array<{ x: number; y: number; w: number; h: number; ref: string }>,
  refs: Array<{ name: string; id: string }>
) {
  let idx = 1;
  const panelsJSON = panels.map((p) => {
    const i = String(idx++);
    return {
      embeddableConfig: {},
      gridData: { x: p.x, y: p.y, w: p.w, h: p.h, i },
      panelIndex: i,
      version: '2.19.0',
      panelRefName: p.ref,
    };
  });

  return {
    type: 'dashboard',
    id,
    attributes: {
      title,
      hits: 0,
      description,
      panelsJSON: JSON.stringify(panelsJSON),
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
    references: refs.map((r) => ({ name: r.name, type: 'visualization', id: r.id })),
  };
}

// ── Markdown tab navigation ─────────────────────────────────────────────────
const navMd = (active: 'host' | 'process' | 'network') => {
  const hostLabel = active === 'host' ? '**▸ Host**' : `[Host](/app/dashboards#/view/${DASH_HOST})`;
  const procLabel = active === 'process' ? '**▸ Processes**' : `[Processes](/app/dashboards#/view/${DASH_PROCESS})`;
  const netLabel = active === 'network' ? '**▸ Network**' : `[Network](/app/dashboards#/view/${DASH_NETWORK})`;
  return `### XDR Agent Telemetry\n${hostLabel} &nbsp;&nbsp;|&nbsp;&nbsp; ${procLabel} &nbsp;&nbsp;|&nbsp;&nbsp; ${netLabel}`;
};

function buildSavedObjects() {
  // ── Index pattern (shared) ──────────────────────────────────────────────
  const indexPattern = {
    type: 'index-pattern',
    id: INDEX_PATTERN_ID,
    attributes: {
      title: '.xdr-agent-telemetry-*',
      timeFieldName: '@timestamp',
      fields: '[]',
    },
    references: [],
  };

  // ── Navigation markdown visualizations ──────────────────────────────────
  const navHost = vis(NAV_HOST, '[XDR] Nav — Host',
    'Tab navigation (Host active)',
    markdownVis('[XDR] Nav — Host', navMd('host')));

  const navProcess = vis(NAV_PROCESS, '[XDR] Nav — Processes',
    'Tab navigation (Processes active)',
    markdownVis('[XDR] Nav — Processes', navMd('process')));

  const navNetwork = vis(NAV_NETWORK, '[XDR] Nav — Network',
    'Tab navigation (Network active)',
    markdownVis('[XDR] Nav — Network', navMd('network')));

  // ═══════════════════════════════════════════════════════════════════════════
  // HOST visualizations
  // ═══════════════════════════════════════════════════════════════════════════
  const visHostEvents = vis(VIS_HOST_EVENTS,
    '[XDR] Host Events', 'Count of host-category telemetry events',
    metricVis('[XDR] Host Events', null, 'count', 'Host Events'),
    'event.category: "host"');

  const visActiveAgents = vis(VIS_ACTIVE_AGENTS,
    '[XDR] Active Agents', 'Unique agent count in the selected time range',
    metricVis('[XDR] Active Agents', 'agent.id', 'cardinality', 'Active Agents'),
    'event.category: "host"');

  const visAvgMemory = vis(VIS_AVG_MEMORY,
    '[XDR] Avg Memory Used %',
    'Average memory used percentage across all agents',
    gaugeVis('[XDR] Avg Memory Used %', 'payload.system.memory.used.pct', 'Avg Memory %',
      [{ from: 0, to: 50 }, { from: 50, to: 75 }, { from: 75, to: 100 }]),
    'event.category: "host"');

  const visAvgCpu = vis(VIS_AVG_CPU,
    '[XDR] Avg CPU Used %',
    'Average CPU used percentage across all agents',
    gaugeVis('[XDR] Avg CPU Used %', 'payload.system.cpu.total.pct', 'Avg CPU %',
      [{ from: 0, to: 50 }, { from: 50, to: 75 }, { from: 75, to: 100 }]),
    'event.category: "host"');

  const visSwapGauge = vis(VIS_SWAP_GAUGE,
    '[XDR] Swap Used %',
    'Average swap used percentage across all agents',
    gaugeVis('[XDR] Swap Used %', 'payload.system.memory.swap.used.pct', 'Avg Swap %',
      [{ from: 0, to: 50 }, { from: 50, to: 80 }, { from: 80, to: 100 }]),
    'event.category: "host"');

  const visDiskGauge = vis(VIS_DISK_GAUGE,
    '[XDR] Disk Used % (root)',
    'Average root filesystem used percentage across all agents',
    gaugeVis('[XDR] Disk Used % (root)', 'payload.system.disk.root.used.pct', 'Disk %',
      [{ from: 0, to: 70 }, { from: 70, to: 85 }, { from: 85, to: 100 }]),
    'event.category: "host"');

  const visHostnameFilter = {
    type: 'visualization',
    id: VIS_HOSTNAME_FILTER,
    attributes: {
      title: '[XDR] Filter by Hostname',
      visState: JSON.stringify({
        title: '[XDR] Filter by Hostname',
        type: 'input_control_vis',
        params: {
          controls: [{
            id: '1',
            fieldName: 'host.hostname',
            indexPatternRefName: 'indexPattern_0',
            label: 'Host',
            type: 'list',
            options: {
              type: 'terms',
              multiselect: true,
              size: 100,
              order: 'desc',
              dynamicOptions: true,
            },
          }],
          updateFiltersOnChange: true,
          useTimeFilter: true,
          pinFilters: false,
        },
        aggs: [],
      }),
      uiStateJSON: '{}',
      description: 'Filter host telemetry by host.hostname',
      version: 1,
      kibanaSavedObjectMeta: {
        searchSourceJSON: JSON.stringify({ filter: [], query: { query: '', language: 'kuery' } }),
      },
    },
    references: [{ name: 'indexPattern_0', type: 'index-pattern', id: INDEX_PATTERN_ID }],
  };

  const visCpuPerAgent = vis(VIS_CPU_PER_AGENT,
    '[XDR] CPU Usage per Agent',
    'CPU usage % over time, split by agent',
    areaVis('[XDR] CPU Usage per Agent', 'payload.system.cpu.total.pct', 'Avg CPU %', 'agent.id', 'CPU Usage %'),
    'event.category: "host"');

  const visMemTimeline = vis(VIS_MEMORY_TIMELINE,
    '[XDR] Memory Usage Over Time',
    'Memory used % over time, broken down by agent',
    areaVis('[XDR] Memory Usage Over Time', 'payload.system.memory.used.pct', 'Avg Memory %', 'agent.id', 'Memory Used %'),
    'event.category: "host"');

  const visCpuBreakdown = vis(VIS_CPU_BREAKDOWN,
    '[XDR] CPU Breakdown',
    'CPU time breakdown by mode: user, system, iowait, steal',
    JSON.stringify({
      title: '[XDR] CPU Breakdown',
      type: 'area',
      params: {
        type: 'area',
        grid: { categoryLines: false, style: { color: '#eee' } },
        categoryAxes: [{ id: 'CategoryAxis-1', type: 'category', position: 'bottom', show: true, style: {}, scale: { type: 'linear' }, labels: { show: true, truncate: 100, filter: true }, title: {} }],
        valueAxes: [{ id: 'ValueAxis-1', name: 'LeftAxis-1', type: 'value', position: 'left', show: true, style: {}, scale: { type: 'linear', mode: 'normal' }, labels: { show: true, rotate: 0, filter: false, truncate: 100 }, title: { text: 'CPU %' } }],
        seriesParams: [
          { show: true, type: 'area', mode: 'stacked', data: { label: 'User %', id: '1' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, showCircles: false, interpolate: 'linear', lineWidth: 1 },
          { show: true, type: 'area', mode: 'stacked', data: { label: 'System %', id: '2' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, showCircles: false, interpolate: 'linear', lineWidth: 1 },
          { show: true, type: 'area', mode: 'stacked', data: { label: 'IOWait %', id: '3' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, showCircles: false, interpolate: 'linear', lineWidth: 1 },
          { show: true, type: 'area', mode: 'stacked', data: { label: 'Steal %', id: '4' }, valueAxis: 'ValueAxis-1', drawLinesBetweenPoints: true, showCircles: false, interpolate: 'linear', lineWidth: 1 },
        ],
        addTooltip: true, addLegend: true, legendPosition: 'top',
        times: [], addTimeMarker: false,
      },
      aggs: [
        { id: '1', enabled: true, type: 'avg', schema: 'metric', params: { field: 'payload.system.cpu.user.pct', customLabel: 'User %' } },
        { id: '2', enabled: true, type: 'avg', schema: 'metric', params: { field: 'payload.system.cpu.system.pct', customLabel: 'System %' } },
        { id: '3', enabled: true, type: 'avg', schema: 'metric', params: { field: 'payload.system.cpu.iowait.pct', customLabel: 'IOWait %' } },
        { id: '4', enabled: true, type: 'avg', schema: 'metric', params: { field: 'payload.system.cpu.steal.pct', customLabel: 'Steal %' } },
        { id: '5', enabled: true, type: 'date_histogram', schema: 'segment', params: { field: '@timestamp', interval: 'auto', min_doc_count: 1, extended_bounds: {} } },
      ],
    }),
    'event.category: "host"');

  const visDiskIO = vis(VIS_DISKIO,
    '[XDR] Disk I/O',
    'Disk read vs write bytes per collection interval',
    dualAreaVis('[XDR] Disk I/O', 'payload.system.diskio.read.bytes', 'Read bytes', 'payload.system.diskio.write.bytes', 'Write bytes', 'Bytes / interval'),
    'event.category: "host"');

  const visNetIO = vis(VIS_NETIO,
    '[XDR] Network I/O',
    'Network inbound vs outbound bytes per collection interval',
    dualAreaVis('[XDR] Network I/O', 'payload.system.netio.in.bytes', 'In bytes', 'payload.system.netio.out.bytes', 'Out bytes', 'Bytes / interval'),
    'event.category: "host"');

  // ═══════════════════════════════════════════════════════════════════════════
  // PROCESS visualizations
  // ═══════════════════════════════════════════════════════════════════════════
  const visProcessEvents = vis(VIS_PROCESS_EVENTS,
    '[XDR] Process Events', 'Count of process-category telemetry events',
    metricVis('[XDR] Process Events', null, 'count', 'Process Events'),
    'event.category: "process"');

  const visUniqueProcs = vis(VIS_UNIQUE_PROCESSES,
    '[XDR] Unique Processes', 'Distinct process names observed',
    metricVis('[XDR] Unique Processes', 'payload.process.name', 'cardinality', 'Unique Processes'),
    'event.category: "process"');

  const visCpuPerProcess = vis(VIS_CPU_PER_PROCESS,
    '[XDR] CPU per Process',
    'Top processes by average CPU usage',
    JSON.stringify({
      title: '[XDR] CPU per Process',
      type: 'horizontal_bar',
      params: {
        type: 'horizontal_bar',
        grid: { categoryLines: false, style: { color: '#eee' } },
        categoryAxes: [{ id: 'CategoryAxis-1', type: 'category', position: 'left', show: true, style: {},
          scale: { type: 'linear' }, labels: { show: true, truncate: 200, filter: true }, title: {} }],
        valueAxes: [{ id: 'ValueAxis-1', name: 'BottomAxis-1', type: 'value', position: 'bottom', show: true, style: {},
          scale: { type: 'linear', mode: 'normal' }, labels: { show: true, rotate: 0, filter: false, truncate: 100 },
          title: { text: 'Avg CPU %' } }],
        seriesParams: [{ show: true, type: 'histogram', mode: 'normal',
          data: { label: 'Avg CPU %', id: '1' }, valueAxis: 'ValueAxis-1' }],
        addTooltip: true, addLegend: true, legendPosition: 'right',
        times: [], addTimeMarker: false,
      },
      aggs: [
        { id: '1', enabled: true, type: 'avg', schema: 'metric',
          params: { field: 'payload.process.cpu.pct', customLabel: 'Avg CPU %' } },
        { id: '2', enabled: true, type: 'terms', schema: 'segment',
          params: { field: 'payload.process.name', size: 20, order: 'desc', orderBy: '1',
            otherBucket: false, missingBucket: false, customLabel: 'Process' } },
      ],
    }),
    'event.category: "process"');

  const visProcTimeline = vis(VIS_PROCESS_TIMELINE,
    '[XDR] Process Events Over Time',
    'Process event count over time',
    countAreaVis('[XDR] Process Events Over Time', 'Events'),
    'event.category: "process"');

  // ═══════════════════════════════════════════════════════════════════════════
  // NETWORK visualizations
  // ═══════════════════════════════════════════════════════════════════════════
  const visNetEvents = vis(VIS_NETWORK_EVENTS,
    '[XDR] Network Events', 'Count of network-category telemetry events',
    metricVis('[XDR] Network Events', null, 'count', 'Network Events'),
    'event.category: "network"');

  const visNetInbound = vis(VIS_NET_INBOUND,
    '[XDR] Inbound Connections', 'Count of inbound network events',
    metricVis('[XDR] Inbound Connections', null, 'count', '↓ Inbound'),
    'event.category: "network" and payload.network.direction: "inbound"');

  const visNetOutbound = vis(VIS_NET_OUTBOUND,
    '[XDR] Outbound Connections', 'Count of outbound network events',
    metricVis('[XDR] Outbound Connections', null, 'count', '↑ Outbound'),
    'event.category: "network" and payload.network.direction: "outbound"');

  const visNetProtocol = vis(VIS_NET_PROTOCOL,
    '[XDR] Protocol Distribution', 'Network events by protocol',
    pieVis('[XDR] Protocol Distribution', 'payload.network.protocol', 'Protocol'),
    'event.category: "network"');

  const visNetState = vis(VIS_NET_STATE,
    '[XDR] Connection States', 'Network events by TCP state',
    pieVis('[XDR] Connection States', 'payload.network.state', 'State'),
    'event.category: "network"');

  const visNetDirection = vis(VIS_NET_DIRECTION,
    '[XDR] Traffic Direction', 'Network events by direction',
    pieVis('[XDR] Traffic Direction', 'payload.network.direction', 'Direction'),
    'event.category: "network"');

  const visNetTimeline = vis(VIS_NET_TIMELINE,
    '[XDR] Network Events Over Time', 'Network event count over time',
    countAreaVis('[XDR] Network Events Over Time', 'Events'),
    'event.category: "network"');

  // ═══════════════════════════════════════════════════════════════════════════
  // DASHBOARDS
  // ═══════════════════════════════════════════════════════════════════════════

  // ── Host Dashboard ────────────────────────────────────────────────────────
  // Layout (48 cols):
  //   Row 0:  nav (48, h=5)
  //   Row 5:  filter (24, h=8) | host-events (12, h=8) | active-agents (12, h=8)
  //   Row 13: avg-memory (12, h=15) | avg-cpu (12, h=15) | swap (12, h=15) | disk (12, h=15)
  //   Row 28: cpu-per-agent (24, h=15) | memory-timeline (24, h=15)
  //   Row 43: cpu-breakdown (24, h=14) | disk-io (24, h=14)
  //   Row 57: network-io (48, h=14)

  const dashHost = dashboard(DASH_HOST, 'XDR Telemetry — Host',
    'Host-level system metrics: CPU, memory, disk and network I/O.', [
      { x: 0,  y: 0,  w: 48, h: 5,  ref: 'panel_0' },
      { x: 0,  y: 5,  w: 24, h: 8,  ref: 'panel_6' },
      { x: 24, y: 5,  w: 12, h: 8,  ref: 'panel_1' },
      { x: 36, y: 5,  w: 12, h: 8,  ref: 'panel_2' },
      { x: 0,  y: 13, w: 12, h: 10, ref: 'panel_3' },
      { x: 12, y: 13, w: 12, h: 10, ref: 'panel_7' },
      { x: 24, y: 13, w: 12, h: 10, ref: 'panel_8' },
      { x: 36, y: 13, w: 12, h: 10, ref: 'panel_9' },
      { x: 0,  y: 28, w: 24, h: 14, ref: 'panel_4' },
      { x: 24, y: 28, w: 24, h: 14, ref: 'panel_5' },
      { x: 0,  y: 43, w: 24, h: 14, ref: 'panel_10' },
      { x: 24, y: 43, w: 24, h: 14, ref: 'panel_11' },
      { x: 0,  y: 57, w: 48, h: 14, ref: 'panel_12' },
    ], [
      { name: 'panel_0',  id: NAV_HOST },
      { name: 'panel_1',  id: VIS_HOST_EVENTS },
      { name: 'panel_2',  id: VIS_ACTIVE_AGENTS },
      { name: 'panel_3',  id: VIS_AVG_MEMORY },
      { name: 'panel_4',  id: VIS_CPU_PER_AGENT },
      { name: 'panel_5',  id: VIS_MEMORY_TIMELINE },
      { name: 'panel_6',  id: VIS_HOSTNAME_FILTER },
      { name: 'panel_7',  id: VIS_AVG_CPU },
      { name: 'panel_8',  id: VIS_SWAP_GAUGE },
      { name: 'panel_9',  id: VIS_DISK_GAUGE },
      { name: 'panel_10', id: VIS_CPU_BREAKDOWN },
      { name: 'panel_11', id: VIS_DISKIO },
      { name: 'panel_12', id: VIS_NETIO },
    ]);

  // ── Process Dashboard ─────────────────────────────────────────────────────
  // Layout:
  //   Row 0:  nav (48, 5)
  //   Row 5:  process-events (24, 8) | unique-processes (24, 8)
  //   Row 13: cpu-per-process (24, 16) | process-timeline (24, 16)

  const dashProcess = dashboard(DASH_PROCESS, 'XDR Telemetry — Processes',
    'Per-process CPU telemetry: top consumers, trends over time.', [
      { x: 0,  y: 0,  w: 48, h: 5,  ref: 'panel_0' },
      { x: 0,  y: 5,  w: 24, h: 8,  ref: 'panel_1' },
      { x: 24, y: 5,  w: 24, h: 8,  ref: 'panel_2' },
      { x: 0,  y: 13, w: 24, h: 16, ref: 'panel_3' },
      { x: 24, y: 13, w: 24, h: 16, ref: 'panel_4' },
    ], [
      { name: 'panel_0', id: NAV_PROCESS },
      { name: 'panel_1', id: VIS_PROCESS_EVENTS },
      { name: 'panel_2', id: VIS_UNIQUE_PROCESSES },
      { name: 'panel_3', id: VIS_CPU_PER_PROCESS },
      { name: 'panel_4', id: VIS_PROCESS_TIMELINE },
    ]);

  // ── Network Dashboard ─────────────────────────────────────────────────────
  // Layout:
  //   Row 0:  nav (48, 5)
  //   Row 5:  net-events (16, 8) | inbound (16, 8) | outbound (16, 8)
  //   Row 13: protocol pie (16, 14) | state pie (16, 14) | direction pie (16, 14)
  //   Row 27: net-timeline (48, 14)

  const dashNetwork = dashboard(DASH_NETWORK, 'XDR Telemetry — Network',
    'Network connection events: protocol, state, and direction distribution.', [
      { x: 0,  y: 0,  w: 48, h: 5,  ref: 'panel_0' },
      { x: 0,  y: 5,  w: 16, h: 8,  ref: 'panel_1' },
      { x: 16, y: 5,  w: 16, h: 8,  ref: 'panel_2' },
      { x: 32, y: 5,  w: 16, h: 8,  ref: 'panel_3' },
      { x: 0,  y: 13, w: 16, h: 14, ref: 'panel_4' },
      { x: 16, y: 13, w: 16, h: 14, ref: 'panel_5' },
      { x: 32, y: 13, w: 16, h: 14, ref: 'panel_6' },
      { x: 0,  y: 27, w: 48, h: 14, ref: 'panel_7' },
    ], [
      { name: 'panel_0', id: NAV_NETWORK },
      { name: 'panel_1', id: VIS_NETWORK_EVENTS },
      { name: 'panel_2', id: VIS_NET_INBOUND },
      { name: 'panel_3', id: VIS_NET_OUTBOUND },
      { name: 'panel_4', id: VIS_NET_PROTOCOL },
      { name: 'panel_5', id: VIS_NET_STATE },
      { name: 'panel_6', id: VIS_NET_DIRECTION },
      { name: 'panel_7', id: VIS_NET_TIMELINE },
    ]);

  return {
    indexPatterns: [indexPattern],
    dashboardObjects: [
      // Navigation markdown
      navHost, navProcess, navNetwork,
      // Host
      visHostEvents, visActiveAgents, visAvgMemory, visAvgCpu, visSwapGauge, visDiskGauge,
      visHostnameFilter, visCpuPerAgent, visMemTimeline, visCpuBreakdown, visDiskIO, visNetIO,
      // Process
      visProcessEvents, visUniqueProcs, visCpuPerProcess, visProcTimeline,
      // Network
      visNetEvents, visNetInbound, visNetOutbound, visNetProtocol, visNetState, visNetDirection, visNetTimeline,
      // Dashboards
      dashHost, dashProcess, dashNetwork,
    ],
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function installTelemetryDashboard(
  repo: ISavedObjectsRepository,
  logger: Logger
): Promise<void> {
  const { indexPatterns, dashboardObjects } = buildSavedObjects();

  try {
    // 1. Index pattern — overwrite:false to avoid racing with OSD field-refresh
    const ipResult = await repo.bulkCreate(indexPatterns as any[], { overwrite: false });
    const ipErrors = ipResult.saved_objects.filter(
      (o: any) => o.error && o.error.statusCode !== 409
    );
    if (ipErrors.length > 0) {
      logger.warn(
        `xdr_manager: index-pattern install error: ` +
          ipErrors.map((e: any) => `${e.type}/${e.id}: ${e.error.message}`).join('; ')
      );
    }

    // 2. Visualizations + dashboards — overwrite:true to always push latest definitions
    const dbResult = await repo.bulkCreate(dashboardObjects as any[], { overwrite: true });
    const dbErrors = dbResult.saved_objects.filter((o: any) => o.error);
    const created = dbResult.saved_objects.filter((o: any) => !o.error).length;

    if (dbErrors.length > 0) {
      logger.warn(
        `xdr_manager: dashboard install had ${dbErrors.length} error(s): ` +
          dbErrors.map((e: any) => `${e.type}/${e.id}: ${e.error?.message}`).join('; ')
      );
    }

    logger.info(
      `xdr_manager: installed telemetry dashboards (Host, Process, Network) — ${created} objects written`
    );
  } catch (err) {
    logger.error(`xdr_manager: failed to install telemetry dashboards: ${err}`);
  }
}
