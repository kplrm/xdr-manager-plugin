import React from 'react';
import {
  EuiBadge,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiInMemoryTable,
  EuiPanel,
  EuiSpacer,
  EuiStat,
  EuiTitle,
  EuiToolTip,
  EuiCode,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TelemetryProcessEntry, TelemetryProcessResponse } from '../../../common';

interface ProcessTabProps {
  data: TelemetryProcessResponse | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
  if (!bytes || bytes === 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

const STATE_MAP: Record<string, { label: string; color: 'success' | 'warning' | 'danger' | 'hollow' | 'default' }> = {
  R: { label: 'Running',      color: 'success'  },
  S: { label: 'Sleeping',     color: 'hollow'   },
  D: { label: 'Disk Sleep',   color: 'warning'  },
  Z: { label: 'Zombie',       color: 'danger'   },
  T: { label: 'Stopped',      color: 'warning'  },
  I: { label: 'Idle',         color: 'hollow'   },
  t: { label: 'Tracing Stop', color: 'warning'  },
};

const stateInfo = (s: string) => STATE_MAP[s] ?? { label: s || '—', color: 'default' as const };

// ── Component ─────────────────────────────────────────────────────────────────

export const ProcessTab: React.FC<ProcessTabProps> = ({ data }) => {
  if (!data || data.processes.length === 0) {
    return (
      <EuiCallOut
        title={i18n.translate('xdrManager.telemetry.process.noData', {
          defaultMessage: 'No process telemetry data available',
        })}
        iconType="iInCircle"
        color="primary"
      >
        <p>
          {i18n.translate('xdrManager.telemetry.process.noDataDescription', {
            defaultMessage:
              'Process metrics will appear here once enrolled agents start sending process telemetry.',
          })}
        </p>
      </EuiCallOut>
    );
  }

  const topCpu = data.processes[0];
  const maxCpu = Math.max(...data.processes.map((p) => p.cpu_pct), 1);
  const topMem = [...data.processes].sort((a, b) => b.mem_rss_bytes - a.mem_rss_bytes)[0];

  // ── CPU table columns ─────────────────────────────────────────────────
  const cpuColumns = [
    {
      field: 'name',
      name: 'Process',
      sortable: true,
      render: (name: string, proc: TelemetryProcessEntry) => (
        <EuiToolTip content={proc.command_line || proc.executable}>
          <strong>{name}</strong>
        </EuiToolTip>
      ),
    },
    {
      field: 'pid',
      name: 'PID',
      width: '70px',
      sortable: true,
      render: (pid: number, proc: TelemetryProcessEntry) => (
        <EuiToolTip content={`PPID: ${proc.ppid}`}>
          <span>{pid}</span>
        </EuiToolTip>
      ),
    },
    {
      field: 'state',
      name: 'State',
      width: '95px',
      sortable: true,
      render: (s: string) => {
        const { label, color } = stateInfo(s);
        return <EuiBadge color={color}>{label}</EuiBadge>;
      },
    },
    {
      field: 'cpu_pct',
      name: 'CPU %',
      width: '120px',
      sortable: true,
      render: (pct: number, proc: TelemetryProcessEntry) => (
        <EuiFlexGroup gutterSize="xs" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiBadge color={pct > 50 ? 'danger' : pct > 20 ? 'warning' : 'hollow'}>
              {pct.toFixed(2)}%
            </EuiBadge>
          </EuiFlexItem>
          <EuiFlexItem>
            <div style={{ height: 10, backgroundColor: '#f5f7fa', borderRadius: 4, overflow: 'hidden', minWidth: 60 }}>
              <div
                style={{
                  height: '100%',
                  width: `${Math.min((proc.cpu_pct / maxCpu) * 100, 100)}%`,
                  backgroundColor: proc.cpu_pct > 50 ? '#BD271E' : proc.cpu_pct > 20 ? '#F5A700' : '#006BB4',
                  borderRadius: 4,
                }}
              />
            </div>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
    {
      field: 'user_name',
      name: 'User',
      width: '100px',
      sortable: true,
      render: (name: string, proc: TelemetryProcessEntry) => (
        <EuiToolTip content={`UID: ${proc.user_id}  GID: ${proc.group_id}`}>
          <span>{name || String(proc.user_id) || '—'}</span>
        </EuiToolTip>
      ),
    },
    {
      field: 'threads_count',
      name: 'Threads',
      width: '75px',
      sortable: true,
      render: (n: number) => n || '—',
    },
    {
      field: 'parent_name',
      name: 'Parent',
      width: '100px',
      sortable: true,
      render: (name: string, proc: TelemetryProcessEntry) => (
        <EuiToolTip content={`PPID: ${proc.parent_pid}`}>
          <span>{name || '—'}</span>
        </EuiToolTip>
      ),
    },
    {
      field: 'executable',
      name: 'Executable',
      truncateText: true,
      render: (exe: string) => (
        <EuiToolTip content={exe}>
          <span>{exe || '—'}</span>
        </EuiToolTip>
      ),
    },
    {
      field: 'timestamp',
      name: 'Last Seen',
      width: '150px',
      sortable: true,
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
  ];

  // ── Memory / IO table columns ─────────────────────────────────────────
  const resourceColumns = [
    {
      field: 'name',
      name: 'Process',
      sortable: true,
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      field: 'pid',
      name: 'PID',
      width: '70px',
      sortable: true,
    },
    {
      field: 'mem_rss_bytes',
      name: 'RSS Memory',
      width: '110px',
      sortable: true,
      render: (b: number) => formatBytes(b),
    },
    {
      field: 'mem_vms_bytes',
      name: 'Virtual Mem',
      width: '110px',
      sortable: true,
      render: (b: number) => formatBytes(b),
    },
    {
      field: 'io_read_bytes',
      name: 'IO Read',
      width: '110px',
      sortable: true,
      render: (b: number) => formatBytes(b),
    },
    {
      field: 'io_write_bytes',
      name: 'IO Write',
      width: '110px',
      sortable: true,
      render: (b: number) => formatBytes(b),
    },
    {
      field: 'fd_count',
      name: 'FDs',
      width: '65px',
      sortable: true,
      render: (n: number) => n || '—',
    },
    {
      field: 'working_directory',
      name: 'CWD',
      truncateText: true,
      render: (cwd: string) => (
        <EuiToolTip content={cwd}>
          <EuiCode>{cwd || '—'}</EuiCode>
        </EuiToolTip>
      ),
    },
    {
      field: 'exe_sha256',
      name: 'SHA-256',
      width: '120px',
      render: (h: string) =>
        h ? (
          <EuiToolTip content={h}>
            <EuiCode>{h.slice(0, 12)}…</EuiCode>
          </EuiToolTip>
        ) : (
          <span>—</span>
        ),
    },
    {
      field: 'cap_eff',
      name: 'Capabilities',
      width: '120px',
      render: (c: string) =>
        c && c !== '0000000000000000' ? (
          <EuiToolTip content="Effective Linux capabilities bitmask (non-zero = elevated)">
            <EuiBadge color="warning">{c}</EuiBadge>
          </EuiToolTip>
        ) : (
          <span>—</span>
        ),
    },
  ];

  return (
    <>
      {/* ── Stat cards — row 1: events & CPU ──────────────────────────── */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.total_events)}
              description="Process Events (24 h)"
              titleColor="primary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.processes.length)}
              description="Unique Processes"
              titleColor="primary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={topCpu.name}
              description="Top CPU Consumer"
              titleColor="accent"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={`${topCpu.cpu_pct.toFixed(2)}%`}
              description="Highest CPU %"
              titleColor={topCpu.cpu_pct > 50 ? 'danger' : 'accent'}
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {/* ── Stat cards — row 2: lifecycle & memory ────────────────────── */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.process_starts)}
              description="Process Starts (24 h)"
              titleColor="success"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.process_ends)}
              description="Process Exits (24 h)"
              titleColor="subdued"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={topMem.name}
              description="Top Memory Consumer"
              titleColor="accent"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={formatBytes(topMem.mem_rss_bytes)}
              description="Highest RSS"
              titleColor={topMem.mem_rss_bytes > 1024 * 1024 * 1024 ? 'danger' : 'accent'}
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* ── Process table — by CPU ────────────────────────────────────── */}
      <EuiPanel paddingSize="m" hasBorder>
        <EuiTitle size="xs">
          <h3>Processes — CPU, State & Lineage</h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          <p>Sorted by CPU %. Hover PID for parent PID, hover name for full command line.</p>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiInMemoryTable
          items={data.processes}
          columns={cpuColumns}
          pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 20, 50] }}
          sorting={{ sort: { field: 'cpu_pct', direction: 'desc' } }}
        />
      </EuiPanel>

      <EuiSpacer size="l" />

      {/* ── Process table — memory & IO ──────────────────────────────── */}
      <EuiPanel paddingSize="m" hasBorder>
        <EuiTitle size="xs">
          <h3>Processes — Memory, I/O & Security</h3>
        </EuiTitle>
        <EuiText size="xs" color="subdued">
          <p>
            RSS/VMS and cumulative I/O bytes from <EuiCode>process.start</EuiCode> events.
            SHA-256 and capabilities collected at process creation only.
          </p>
        </EuiText>
        <EuiSpacer size="s" />
        <EuiInMemoryTable<TelemetryProcessEntry>
          items={data.processes}
          columns={resourceColumns}
          pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 20, 50] }}
          sorting={{ sort: { field: 'mem_rss_bytes', direction: 'desc' } }}
        />
      </EuiPanel>
    </>
  );
};
