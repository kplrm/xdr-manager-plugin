import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiInMemoryTable,
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { BrowserRouter as Router } from 'react-router-dom';
import { CoreStart } from '../../../../src/core/public';
import {
  ListAgentsResponse,
  RunActionResponse,
  XdrAction,
  XdrAgent,
  XdrPolicy,
} from '../../common';

interface XdrManagerAppDeps {
  basename: string;
  notifications: CoreStart['notifications'];
  http: CoreStart['http'];
}

const statusColorMap: Record<string, 'success' | 'warning' | 'danger'> = {
  healthy: 'success',
  degraded: 'warning',
  offline: 'danger',
};

export const XdrManagerApp = ({ basename, notifications, http }: XdrManagerAppDeps) => {
  const [agents, setAgents] = useState<XdrAgent[]>([]);
  const [policies, setPolicies] = useState<XdrPolicy[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const [isEnrollFlyoutOpen, setIsEnrollFlyoutOpen] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [tagsText, setTagsText] = useState('linux,production');
  const [isSubmittingEnroll, setIsSubmittingEnroll] = useState(false);

  const policyNameById = useMemo(
    () => Object.fromEntries(policies.map((policy) => [policy.id, policy.name])),
    [policies]
  );

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await http.get<ListAgentsResponse>('/api/xdr_manager/agents');
      setAgents(response.agents);
      setPolicies(response.policies);
      if (!policyId && response.policies.length > 0) {
        setPolicyId(response.policies[0].id);
      }
    } catch (error) {
      notifications.toasts.addDanger({
        title: i18n.translate('xdrManager.loadDataError', {
          defaultMessage: 'Unable to load XDR data',
        }),
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [http, notifications.toasts, policyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const runAction = useCallback(
    async (agentId: string, action: XdrAction) => {
      try {
        const response = await http.post<RunActionResponse>(`/api/xdr_manager/agents/${agentId}/action`, {
          body: JSON.stringify({ action }),
        });
        setAgents((previous) =>
          previous.map((agent) => (agent.id === response.agent.id ? response.agent : agent))
        );
        notifications.toasts.addSuccess(response.message);
      } catch (error) {
        notifications.toasts.addDanger({
          title: i18n.translate('xdrManager.actionError', {
            defaultMessage: 'Unable to run action',
          }),
          text: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [http, notifications.toasts]
  );

  const enrollAgent = useCallback(async () => {
    if (!agentName.trim()) {
      notifications.toasts.addWarning(
        i18n.translate('xdrManager.agentNameRequired', {
          defaultMessage: 'Agent name is required.',
        })
      );
      return;
    }

    setIsSubmittingEnroll(true);
    try {
      const tags = tagsText
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);
      await http.post('/api/xdr_manager/agents/enroll', {
        body: JSON.stringify({
          name: agentName.trim(),
          policyId,
          tags,
        }),
      });
      notifications.toasts.addSuccess(
        i18n.translate('xdrManager.enrollSuccess', {
          defaultMessage: 'Agent enrolled successfully.',
        })
      );
      setAgentName('');
      setTagsText('linux,production');
      setIsEnrollFlyoutOpen(false);
      await loadData();
    } catch (error) {
      notifications.toasts.addDanger({
        title: i18n.translate('xdrManager.enrollError', {
          defaultMessage: 'Unable to enroll agent',
        }),
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSubmittingEnroll(false);
    }
  }, [agentName, http, loadData, notifications.toasts, policyId, tagsText]);

  const columns = [
    {
      field: 'name',
      name: i18n.translate('xdrManager.column.name', { defaultMessage: 'Agent' }),
    },
    {
      name: i18n.translate('xdrManager.column.policy', { defaultMessage: 'Policy' }),
      render: (agent: XdrAgent) => policyNameById[agent.policyId] ?? agent.policyId,
    },
    {
      field: 'status',
      name: i18n.translate('xdrManager.column.status', { defaultMessage: 'Status' }),
      render: (status: string) => <EuiBadge color={statusColorMap[status] ?? 'hollow'}>{status}</EuiBadge>,
    },
    {
      field: 'version',
      name: i18n.translate('xdrManager.column.version', { defaultMessage: 'Version' }),
    },
    {
      field: 'lastSeen',
      name: i18n.translate('xdrManager.column.lastSeen', { defaultMessage: 'Last seen (UTC)' }),
    },
    {
      name: i18n.translate('xdrManager.column.tags', { defaultMessage: 'Tags' }),
      render: (agent: XdrAgent) => agent.tags.join(', '),
    },
    {
      name: i18n.translate('xdrManager.column.actions', { defaultMessage: 'Actions' }),
      render: (agent: XdrAgent) => (
        <EuiFlexGroup gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={() => runAction(agent.id, 'restart')}>
              {i18n.translate('xdrManager.action.restart', { defaultMessage: 'Restart' })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={() => runAction(agent.id, 'isolate')}>
              {i18n.translate('xdrManager.action.isolate', { defaultMessage: 'Isolate' })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={() => runAction(agent.id, 'upgrade')}>
              {i18n.translate('xdrManager.action.upgrade', { defaultMessage: 'Upgrade' })}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  return (
    <Router basename={basename}>
      <EuiPage restrictWidth={1200}>
        <EuiPageBody component="main">
          <EuiPageHeader
            pageTitle={i18n.translate('xdrManager.pageTitle', { defaultMessage: 'XDR Manager' })}
            rightSideItems={[
              <EuiButton fill onClick={() => setIsEnrollFlyoutOpen(true)} key="enroll">
                {i18n.translate('xdrManager.enrollButton', { defaultMessage: 'Enroll XDR' })}
              </EuiButton>,
            ]}
          />

          <EuiCallOut
            title={i18n.translate('xdrManager.mdoTitle', {
              defaultMessage: 'MVP mode: local in-memory control plane',
            })}
            iconType="iInCircle"
          >
            <p>
              {i18n.translate('xdrManager.mvpDescription', {
                defaultMessage:
                  'This MVP focuses on policy assignment, enroll simulation, and remote control actions so you can validate workflows before integrating a real agent transport.',
              })}
            </p>
          </EuiCallOut>

          <EuiSpacer size="m" />

          <EuiPanel>
            <EuiInMemoryTable
              itemId="id"
              items={agents}
              columns={columns}
              loading={isLoading}
              pagination
              sorting
              search={{
                box: {
                  incremental: true,
                },
              }}
            />
          </EuiPanel>

          {isEnrollFlyoutOpen && (
            <EuiFlyout onClose={() => setIsEnrollFlyoutOpen(false)} ownFocus>
              <EuiFlyoutHeader hasBorder>
                <EuiTitle size="m">
                  <h2>
                    {i18n.translate('xdrManager.enrollFlyoutTitle', {
                      defaultMessage: 'Enroll new XDR',
                    })}
                  </h2>
                </EuiTitle>
                <EuiText size="s" color="subdued">
                  <p>
                    {i18n.translate('xdrManager.enrollFlyoutSubtitle', {
                      defaultMessage: 'Fleet-inspired enrollment flow with policy mapping.',
                    })}
                  </p>
                </EuiText>
              </EuiFlyoutHeader>

              <EuiFlyoutBody>
                <EuiForm component="form">
                  <EuiFormRow
                    label={i18n.translate('xdrManager.field.agentName', {
                      defaultMessage: 'Agent name',
                    })}
                  >
                    <EuiFieldText
                      value={agentName}
                      onChange={(event) => setAgentName(event.target.value)}
                      placeholder="edge-node-01"
                    />
                  </EuiFormRow>

                  <EuiFormRow
                    label={i18n.translate('xdrManager.field.policy', {
                      defaultMessage: 'Policy',
                    })}
                  >
                    <EuiSelect
                      value={policyId}
                      onChange={(event) => setPolicyId(event.target.value)}
                      options={policies.map((policy) => ({
                        value: policy.id,
                        text: `${policy.name} — ${policy.description}`,
                      }))}
                    />
                  </EuiFormRow>

                  <EuiFormRow
                    label={i18n.translate('xdrManager.field.tags', {
                      defaultMessage: 'Tags (comma-separated)',
                    })}
                  >
                    <EuiFieldText
                      value={tagsText}
                      onChange={(event) => setTagsText(event.target.value)}
                      placeholder="linux,production"
                    />
                  </EuiFormRow>
                </EuiForm>
              </EuiFlyoutBody>

              <EuiFlyoutFooter>
                <EuiButtonEmpty onClick={() => setIsEnrollFlyoutOpen(false)}>
                  {i18n.translate('xdrManager.cancelButton', { defaultMessage: 'Cancel' })}
                </EuiButtonEmpty>
                <EuiButton onClick={enrollAgent} fill isLoading={isSubmittingEnroll}>
                  {i18n.translate('xdrManager.confirmEnrollButton', { defaultMessage: 'Enroll' })}
                </EuiButton>
              </EuiFlyoutFooter>
            </EuiFlyout>
          )}
        </EuiPageBody>
      </EuiPage>
    </Router>
  );
};
