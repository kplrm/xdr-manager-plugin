import React, { useMemo } from 'react';
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
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TelemetryNetworkConnection, TelemetryNetworkResponse } from '../../../common';

interface NetworkTabProps {
  data: TelemetryNetworkResponse | null;
}

const directionColor: Record<string, string> = {
  inbound: 'success',
  outbound: 'primary',
  unknown: 'hollow',
};

const stateColor: Record<string, string> = {
  ESTABLISHED: 'success',
  LISTEN: 'primary',
  TIME_WAIT: 'warning',
  CLOSE_WAIT: 'warning',
  SYN_SENT: 'accent',
  SYN_RECV: 'accent',
  CLOSED: 'danger',
  FIN_WAIT1: 'warning',
  FIN_WAIT2: 'warning',
  LAST_ACK: 'warning',
};

export const NetworkTab: React.FC<NetworkTabProps> = ({ data }) => {
  if (!data || data.connections.length === 0) {
    return (
      <EuiCallOut
        title={i18n.translate('xdrManager.telemetry.network.noData', {
          defaultMessage: 'No network telemetry data available',
        })}
        iconType="iInCircle"
        color="primary"
      >
        <p>
          {i18n.translate('xdrManager.telemetry.network.noDataDescription', {
            defaultMessage:
              'Network events will appear here once enrolled agents start sending network telemetry.',
          })}
        </p>
      </EuiCallOut>
    );
  }

  const protocolEntries = useMemo(
    () => Object.entries(data.protocols).sort((a, b) => b[1] - a[1]),
    [data.protocols]
  );

  const stateEntries = useMemo(
    () => Object.entries(data.states).sort((a, b) => b[1] - a[1]),
    [data.states]
  );

  const columns = [
    {
      field: 'direction',
      name: i18n.translate('xdrManager.telemetry.network.col.direction', {
        defaultMessage: 'Direction',
      }),
      width: '120px',
      sortable: true,
      render: (dir: string) => (
        <EuiBadge color={directionColor[dir] ?? 'hollow'}>
          {dir === 'inbound' ? '↓ inbound' : dir === 'outbound' ? '↑ outbound' : dir}
        </EuiBadge>
      ),
    },
    {
      name: i18n.translate('xdrManager.telemetry.network.col.local', {
        defaultMessage: 'Local',
      }),
      width: '200px',
      render: (conn: TelemetryNetworkConnection) =>
        `${conn.local_addr}:${conn.local_port}`,
    },
    {
      name: i18n.translate('xdrManager.telemetry.network.col.remote', {
        defaultMessage: 'Remote',
      }),
      width: '200px',
      render: (conn: TelemetryNetworkConnection) =>
        `${conn.remote_addr}:${conn.remote_port}`,
    },
    {
      field: 'protocol',
      name: i18n.translate('xdrManager.telemetry.network.col.protocol', {
        defaultMessage: 'Protocol',
      }),
      width: '90px',
      sortable: true,
      render: (protocol: string) => (
        <EuiBadge color="hollow">{protocol.toUpperCase()}</EuiBadge>
      ),
    },
    {
      field: 'state',
      name: i18n.translate('xdrManager.telemetry.network.col.state', {
        defaultMessage: 'State',
      }),
      width: '130px',
      sortable: true,
      render: (state: string) => (
        <EuiBadge color={stateColor[state] ?? 'hollow'}>{state}</EuiBadge>
      ),
    },
    {
      field: 'event_type',
      name: i18n.translate('xdrManager.telemetry.network.col.eventType', {
        defaultMessage: 'Event',
      }),
      width: '200px',
      sortable: true,
    },
    {
      field: 'timestamp',
      name: i18n.translate('xdrManager.telemetry.network.col.timestamp', {
        defaultMessage: 'Time',
      }),
      width: '160px',
      sortable: true,
      render: (ts: string) => new Date(ts).toLocaleString(),
    },
  ];

  return (
    <>
      {/* ── Stat cards ──────────────────────────────────────────────── */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.summary.total)}
              description={i18n.translate(
                'xdrManager.telemetry.network.totalConnections',
                { defaultMessage: 'Total Connections' }
              )}
              titleColor="primary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.summary.inbound)}
              description={i18n.translate('xdrManager.telemetry.network.inbound', {
                defaultMessage: '↓ Inbound',
              })}
              titleColor="secondary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.summary.outbound)}
              description={i18n.translate('xdrManager.telemetry.network.outbound', {
                defaultMessage: '↑ Outbound',
              })}
              titleColor="accent"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* ── Protocol & State distribution ───────────────────────────── */}
      <EuiFlexGroup gutterSize="l">
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xdrManager.telemetry.network.protocolDist', {
                  defaultMessage: 'Protocols',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap responsive={false}>
              {protocolEntries.map(([proto, count]) => (
                <EuiFlexItem key={proto} grow={false}>
                  <EuiBadge color="hollow">
                    {proto.toUpperCase()}: {count}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiTitle size="xs">
              <h3>
                {i18n.translate('xdrManager.telemetry.network.stateDist', {
                  defaultMessage: 'Connection States',
                })}
              </h3>
            </EuiTitle>
            <EuiSpacer size="s" />
            <EuiFlexGroup gutterSize="s" wrap responsive={false}>
              {stateEntries.map(([state, count]) => (
                <EuiFlexItem key={state} grow={false}>
                  <EuiBadge color={stateColor[state] ?? 'hollow'}>
                    {state}: {count}
                  </EuiBadge>
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* ── Connections table ────────────────────────────────────────── */}
      <EuiPanel paddingSize="m" hasBorder>
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('xdrManager.telemetry.network.recentConnections', {
              defaultMessage: 'Recent Connections',
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <div style={{ overflowX: 'auto' }}>
          <EuiInMemoryTable
            items={data.connections}
            columns={columns}
            pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 20, 50] }}
            sorting={{ sort: { field: 'timestamp', direction: 'desc' } }}
          />
        </div>
      </EuiPanel>
    </>
  );
};
