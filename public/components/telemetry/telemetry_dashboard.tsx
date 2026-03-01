import React, { useCallback, useEffect, useState } from 'react';
import {
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLoadingSpinner,
  EuiPanel,
  EuiSpacer,
  EuiTab,
  EuiTabs,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { CoreStart } from '../../../../../src/core/public';
import {
  TelemetryHostResponse,
  TelemetryProcessResponse,
  TelemetryNetworkResponse,
} from '../../../common';
import { HostTab } from './host_tab';
import { ProcessTab } from './process_tab';
import { NetworkTab } from './network_tab';

interface TelemetryDashboardProps {
  http: CoreStart['http'];
  notifications: CoreStart['notifications'];
}

type TelemetrySubTab = 'host' | 'process' | 'network';

export const TelemetryDashboard: React.FC<TelemetryDashboardProps> = ({
  http,
  notifications,
}) => {
  const [subTab, setSubTab] = useState<TelemetrySubTab>('host');
  const [hostData, setHostData] = useState<TelemetryHostResponse | null>(null);
  const [processData, setProcessData] = useState<TelemetryProcessResponse | null>(null);
  const [networkData, setNetworkData] = useState<TelemetryNetworkResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(
    async (showErrors = true) => {
      setIsLoading(true);
      setError(null);
      try {
        switch (subTab) {
          case 'host': {
            const d = await http.get<TelemetryHostResponse>(
              '/api/xdr_manager/telemetry/host'
            );
            setHostData(d);
            break;
          }
          case 'process': {
            const d = await http.get<TelemetryProcessResponse>(
              '/api/xdr_manager/telemetry/processes'
            );
            setProcessData(d);
            break;
          }
          case 'network': {
            const d = await http.get<TelemetryNetworkResponse>(
              '/api/xdr_manager/telemetry/network'
            );
            setNetworkData(d);
            break;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        if (showErrors) {
          notifications.toasts.addDanger({
            title: i18n.translate('xdrManager.telemetry.fetchError', {
              defaultMessage: 'Unable to load telemetry data',
            }),
            text: msg,
          });
        }
      } finally {
        setIsLoading(false);
      }
    },
    [http, notifications.toasts, subTab]
  );

  // Fetch on mount and when the sub-tab changes
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 30 s
  useEffect(() => {
    const timer = window.setInterval(() => fetchData(false), 30000);
    return () => window.clearInterval(timer);
  }, [fetchData]);

  // Determine if the currently-active tab already has cached data
  const hasCachedData =
    (subTab === 'host' && hostData !== null) ||
    (subTab === 'process' && processData !== null) ||
    (subTab === 'network' && networkData !== null);

  return (
    <EuiPanel>
      <EuiFlexGroup alignItems="center" justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          <EuiText size="s" color="subdued">
            <p>
              {i18n.translate('xdrManager.telemetry.description', {
                defaultMessage:
                  'Real-time endpoint telemetry from enrolled XDR agents. Data refreshes every 30 seconds.',
              })}
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButtonEmpty
            size="s"
            iconType="refresh"
            onClick={() => fetchData()}
            isLoading={isLoading}
          >
            {i18n.translate('xdrManager.telemetry.refresh', {
              defaultMessage: 'Refresh',
            })}
          </EuiButtonEmpty>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      <EuiTabs size="s">
        <EuiTab onClick={() => setSubTab('host')} isSelected={subTab === 'host'}>
          {i18n.translate('xdrManager.telemetry.tab.host', {
            defaultMessage: 'Host',
          })}
        </EuiTab>
        <EuiTab onClick={() => setSubTab('process')} isSelected={subTab === 'process'}>
          {i18n.translate('xdrManager.telemetry.tab.process', {
            defaultMessage: 'Processes',
          })}
        </EuiTab>
        <EuiTab onClick={() => setSubTab('network')} isSelected={subTab === 'network'}>
          {i18n.translate('xdrManager.telemetry.tab.network', {
            defaultMessage: 'Network',
          })}
        </EuiTab>
      </EuiTabs>

      <EuiSpacer size="m" />

      {error && (
        <>
          <EuiCallOut
            title={i18n.translate('xdrManager.telemetry.error', {
              defaultMessage: 'Error loading telemetry',
            })}
            color="danger"
            iconType="alert"
          >
            <p>{error}</p>
          </EuiCallOut>
          <EuiSpacer size="m" />
        </>
      )}

      {isLoading && !hasCachedData ? (
        <EuiFlexGroup
          justifyContent="center"
          alignItems="center"
          style={{ minHeight: 200 }}
        >
          <EuiFlexItem grow={false}>
            <EuiLoadingSpinner size="xl" />
          </EuiFlexItem>
        </EuiFlexGroup>
      ) : (
        <>
          {subTab === 'host' && <HostTab data={hostData} />}
          {subTab === 'process' && <ProcessTab data={processData} />}
          {subTab === 'network' && <NetworkTab data={networkData} />}
        </>
      )}
    </EuiPanel>
  );
};
