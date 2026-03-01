import React from 'react';
import {
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiProgress,
  EuiSpacer,
  EuiStat,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TelemetryHostResponse } from '../../../common';

interface HostTabProps {
  data: TelemetryHostResponse | null;
}

const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
};

const formatPct = (pct: number): string => `${pct.toFixed(2)}%`;

export const HostTab: React.FC<HostTabProps> = ({ data }) => {
  if (!data?.latest) {
    return (
      <EuiCallOut
        title={i18n.translate('xdrManager.telemetry.host.noData', {
          defaultMessage: 'No host telemetry data available',
        })}
        iconType="iInCircle"
        color="primary"
      >
        <p>
          {i18n.translate('xdrManager.telemetry.host.noDataDescription', {
            defaultMessage:
              'Host metrics will appear here once enrolled agents start sending system telemetry.',
          })}
        </p>
      </EuiCallOut>
    );
  }

  const { cpu, memory } = data.latest;
  const swapUsedPct =
    memory.swap_total > 0
      ? (memory.swap_used_bytes / memory.swap_total) * 100
      : 0;
  const { timeline } = data;

  // CPU breakdown items
  const cpuBreakdown: Array<{
    label: string;
    value: number;
    color: 'primary' | 'accent' | 'warning' | 'danger' | 'subdued';
  }> = [
    { label: 'User', value: cpu.user_pct, color: 'primary' },
    { label: 'System', value: cpu.system_pct, color: 'accent' },
    { label: 'IO Wait', value: cpu.iowait_pct, color: 'warning' },
    { label: 'Steal', value: cpu.steal_pct, color: 'danger' },
    { label: 'Idle', value: cpu.idle_pct, color: 'subdued' },
  ];

  // Memory breakdown items
  const memBreakdown: Array<{
    label: string;
    bytes: number;
    color: 'primary' | 'accent' | 'warning' | 'subdued';
  }> = [
    { label: 'Used', bytes: memory.used_bytes, color: 'primary' },
    { label: 'Cached', bytes: memory.cached, color: 'accent' },
    { label: 'Buffer', bytes: memory.buffer, color: 'warning' },
    { label: 'Free', bytes: memory.free, color: 'subdued' },
  ];

  const cpuTitleColor =
    cpu.total_pct > 80 ? 'danger' : cpu.total_pct > 50 ? 'accent' : 'secondary';
  const memTitleColor =
    memory.used_pct > 90 ? 'danger' : memory.used_pct > 70 ? 'accent' : 'secondary';
  const swapTitleColor =
    swapUsedPct > 80 ? 'danger' : swapUsedPct > 50 ? 'accent' : 'subdued';

  return (
    <>
      {/* ── Row 1: stat cards ───────────────────────────────────────── */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(cpu.cores)}
              description={i18n.translate('xdrManager.telemetry.host.cpuCores', {
                defaultMessage: 'CPU Cores',
              })}
              titleColor="primary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={formatPct(cpu.total_pct)}
              description={i18n.translate('xdrManager.telemetry.host.cpuTotal', {
                defaultMessage: 'CPU Usage',
              })}
              titleColor={cpuTitleColor}
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={formatPct(memory.used_pct)}
              description={i18n.translate('xdrManager.telemetry.host.memoryUsed', {
                defaultMessage: 'Memory Used',
              })}
              titleColor={memTitleColor}
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={formatPct(swapUsedPct)}
              description={i18n.translate('xdrManager.telemetry.host.swapUsed', {
                defaultMessage: 'Swap Used',
              })}
              titleColor={swapTitleColor}
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* ── Row 2: CPU + Memory breakdown side-by-side ──────────────── */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xdrManager.telemetry.host.cpuBreakdown', {
                  defaultMessage: 'CPU Breakdown',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            {cpuBreakdown.map(({ label, value, color }) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false} style={{ width: 70 }}>
                    <EuiText size="xs">
                      <strong>{label}</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiProgress value={value} max={100} size="m" color={color} />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false} style={{ width: 64, textAlign: 'right' }}>
                    <EuiText size="xs">{formatPct(value)}</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </div>
            ))}
          </EuiPanel>
        </EuiFlexItem>

        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xdrManager.telemetry.host.memoryBreakdown', {
                  defaultMessage: 'Memory Breakdown',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="xs" />
            <EuiText size="xs" color="subdued">
              <span>
                {i18n.translate('xdrManager.telemetry.host.totalMemory', {
                  defaultMessage: 'Total',
                })}
                : {formatBytes(memory.total)}
              </span>
            </EuiText>
            <EuiSpacer size="s" />
            {memBreakdown.map(({ label, bytes, color }) => (
              <div key={label} style={{ marginBottom: 8 }}>
                <EuiFlexGroup gutterSize="s" alignItems="center" responsive={false}>
                  <EuiFlexItem grow={false} style={{ width: 70 }}>
                    <EuiText size="xs">
                      <strong>{label}</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiProgress
                      value={memory.total > 0 ? (bytes / memory.total) * 100 : 0}
                      max={100}
                      size="m"
                      color={color}
                    />
                  </EuiFlexItem>
                  <EuiFlexItem grow={false} style={{ width: 80, textAlign: 'right' }}>
                    <EuiText size="xs">{formatBytes(bytes)}</EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </div>
            ))}
            <EuiSpacer size="m" />
            <EuiText size="xs" color="subdued">
              <span>
                {i18n.translate('xdrManager.telemetry.host.swap', {
                  defaultMessage: 'Swap',
                })}
                : {formatBytes(memory.swap_used_bytes)} / {formatBytes(memory.swap_total)}
              </span>
            </EuiText>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      {/* ── Row 3: CPU timeline sparkline ───────────────────────────── */}
      {timeline.length > 1 && (
        <>
          <EuiSpacer size="l" />
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xdrManager.telemetry.host.cpuTimeline', {
                  defaultMessage: 'CPU Usage Over Time',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <svg
                width="100%"
                height="120"
                viewBox={`0 0 ${Math.max(timeline.length - 1, 1) * 8} 100`}
                preserveAspectRatio="none"
                style={{ display: 'block' }}
              >
                <polygon
                  points={
                    `0,100 ` +
                    timeline
                      .map((p, i) => `${i * 8},${100 - Math.min(p.cpu_total_pct, 100)}`)
                      .join(' ') +
                    ` ${(timeline.length - 1) * 8},100`
                  }
                  fill="rgba(0,107,180,0.15)"
                />
                <polyline
                  fill="none"
                  stroke="#006BB4"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  points={timeline
                    .map((p, i) => `${i * 8},${100 - Math.min(p.cpu_total_pct, 100)}`)
                    .join(' ')}
                />
              </svg>
            </div>
            <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {new Date(timeline[0].timestamp).toLocaleTimeString()}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {new Date(timeline[timeline.length - 1].timestamp).toLocaleTimeString()}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </>
      )}

      {/* ── Row 4: Memory timeline sparkline ────────────────────────── */}
      {timeline.length > 1 && (
        <>
          <EuiSpacer size="l" />
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xdrManager.telemetry.host.memoryTimeline', {
                  defaultMessage: 'Memory Usage Over Time',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <div style={{ width: '100%', overflow: 'hidden' }}>
              <svg
                width="100%"
                height="120"
                viewBox={`0 0 ${Math.max(timeline.length - 1, 1) * 8} 100`}
                preserveAspectRatio="none"
                style={{ display: 'block' }}
              >
                <polygon
                  points={
                    `0,100 ` +
                    timeline
                      .map(
                        (p, i) => `${i * 8},${100 - Math.min(p.memory_used_pct, 100)}`
                      )
                      .join(' ') +
                    ` ${(timeline.length - 1) * 8},100`
                  }
                  fill="rgba(1,125,115,0.15)"
                />
                <polyline
                  fill="none"
                  stroke="#017D73"
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  points={timeline
                    .map(
                      (p, i) => `${i * 8},${100 - Math.min(p.memory_used_pct, 100)}`
                    )
                    .join(' ')}
                />
              </svg>
            </div>
            <EuiFlexGroup justifyContent="spaceBetween" responsive={false}>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {new Date(timeline[0].timestamp).toLocaleTimeString()}
                </EuiText>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued">
                  {new Date(timeline[timeline.length - 1].timestamp).toLocaleTimeString()}
                </EuiText>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </>
      )}
    </>
  );
};
