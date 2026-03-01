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
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { TelemetryProcessEntry, TelemetryProcessResponse } from '../../../common';

interface ProcessTabProps {
  data: TelemetryProcessResponse | null;
}

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

  const topProcess = data.processes[0];
  const maxCpu = Math.max(...data.processes.map((p) => p.cpu_pct), 1);

  const columns = [
    {
      field: 'name',
      name: i18n.translate('xdrManager.telemetry.process.col.name', {
        defaultMessage: 'Process',
      }),
      sortable: true,
      render: (name: string) => <strong>{name}</strong>,
    },
    {
      field: 'pid',
      name: i18n.translate('xdrManager.telemetry.process.col.pid', {
        defaultMessage: 'PID',
      }),
      width: '80px',
      sortable: true,
    },
    {
      field: 'cpu_pct',
      name: i18n.translate('xdrManager.telemetry.process.col.cpu', {
        defaultMessage: 'CPU %',
      }),
      width: '100px',
      sortable: true,
      render: (pct: number) => (
        <EuiBadge color={pct > 50 ? 'danger' : pct > 20 ? 'warning' : 'hollow'}>
          {pct.toFixed(2)}%
        </EuiBadge>
      ),
    },
    {
      name: '',
      width: '200px',
      render: (proc: TelemetryProcessEntry) => (
        <div
          style={{
            height: 16,
            width: '100%',
            backgroundColor: '#f5f7fa',
            borderRadius: 4,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${Math.min((proc.cpu_pct / maxCpu) * 100, 100)}%`,
              backgroundColor:
                proc.cpu_pct > 50
                  ? '#BD271E'
                  : proc.cpu_pct > 20
                  ? '#F5A700'
                  : '#006BB4',
              borderRadius: 4,
              transition: 'width 0.3s ease',
            }}
          />
        </div>
      ),
    },
    {
      field: 'executable',
      name: i18n.translate('xdrManager.telemetry.process.col.executable', {
        defaultMessage: 'Executable',
      }),
      truncateText: true,
    },
    {
      field: 'timestamp',
      name: i18n.translate('xdrManager.telemetry.process.col.lastSeen', {
        defaultMessage: 'Last Seen',
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
              title={String(data.total_events)}
              description={i18n.translate('xdrManager.telemetry.process.totalEvents', {
                defaultMessage: 'Process Events (24 h)',
              })}
              titleColor="primary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={String(data.processes.length)}
              description={i18n.translate('xdrManager.telemetry.process.uniqueProcesses', {
                defaultMessage: 'Unique Processes',
              })}
              titleColor="primary"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={topProcess.name}
              description={i18n.translate('xdrManager.telemetry.process.topCpu', {
                defaultMessage: 'Top CPU Consumer',
              })}
              titleColor="accent"
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiPanel paddingSize="m" hasBorder>
            <EuiStat
              title={`${topProcess.cpu_pct.toFixed(2)}%`}
              description={i18n.translate('xdrManager.telemetry.process.topCpuPct', {
                defaultMessage: 'Highest CPU %',
              })}
              titleColor={topProcess.cpu_pct > 50 ? 'danger' : 'accent'}
              titleSize="l"
            />
          </EuiPanel>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="l" />

      {/* ── Process table ───────────────────────────────────────────── */}
      <EuiPanel paddingSize="m" hasBorder>
        <EuiTitle size="xs">
          <h3>
            {i18n.translate('xdrManager.telemetry.process.topProcesses', {
              defaultMessage: 'Top Processes by CPU',
            })}
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiInMemoryTable
          items={data.processes}
          columns={columns}
          pagination={{ pageSize: 10, pageSizeOptions: [5, 10, 20, 50] }}
          sorting={{ sort: { field: 'cpu_pct', direction: 'desc' } }}
        />
      </EuiPanel>
    </>
  );
};
