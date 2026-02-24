import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFieldSearch,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiForm,
  EuiFormRow,
  EuiHorizontalRule,
  EuiInMemoryTable,
  EuiPage,
  EuiPageBody,
  EuiPageHeader,
  EuiPagination,
  EuiPanel,
  EuiSelect,
  EuiSpacer,
  EuiSwitch,
  EuiTab,
  EuiTabs,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@osd/i18n';
import { BrowserRouter as Router } from 'react-router-dom';
import { CoreStart } from '../../../../src/core/public';
import {
  ListAgentsResponse,
  PolicyLogLevel,
  RunActionResponse,
  UpsertPolicyResponse,
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

  const [isPolicyFlyoutOpen, setIsPolicyFlyoutOpen] = useState(false);
  const [editingPolicyId, setEditingPolicyId] = useState<string | null>(null);
  const [policyNameInput, setPolicyNameInput] = useState('');
  const [policyDescriptionInput, setPolicyDescriptionInput] = useState('');
  const [policyLogLevel, setPolicyLogLevel] = useState<PolicyLogLevel>('standard');
  const [policyMalwareProtection, setPolicyMalwareProtection] = useState(true);
  const [policyFileIntegrity, setPolicyFileIntegrity] = useState(true);
  const [policyAutoUpgrade, setPolicyAutoUpgrade] = useState(false);
  const [policyOsqueryEnabled, setPolicyOsqueryEnabled] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);
  const [activeTab, setActiveTab] = useState<'agents' | 'policies'>('agents');

  const [agentSearchQuery, setAgentSearchQuery] = useState('');
  const [agentPageSize, setAgentPageSize] = useState(10);
  const [agentPageIndex, setAgentPageIndex] = useState(0);

  const [policyPageSize, setPolicyPageSize] = useState(10);
  const [policyPageIndex, setPolicyPageIndex] = useState(0);

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

  const openCreatePolicyFlyout = useCallback(() => {
    setEditingPolicyId(null);
    setPolicyNameInput('');
    setPolicyDescriptionInput('');
    setPolicyLogLevel('standard');
    setPolicyMalwareProtection(true);
    setPolicyFileIntegrity(true);
    setPolicyAutoUpgrade(false);
    setPolicyOsqueryEnabled(false);
    setIsPolicyFlyoutOpen(true);
  }, []);

  const openEditPolicyFlyout = useCallback((policy: XdrPolicy) => {
    setEditingPolicyId(policy.id);
    setPolicyNameInput(policy.name);
    setPolicyDescriptionInput(policy.description);
    setPolicyLogLevel(policy.logLevel);
    setPolicyMalwareProtection(policy.malwareProtection);
    setPolicyFileIntegrity(policy.fileIntegrityMonitoring);
    setPolicyAutoUpgrade(policy.autoUpgrade);
    setPolicyOsqueryEnabled(policy.osqueryEnabled);
    setIsPolicyFlyoutOpen(true);
  }, []);

  const savePolicy = useCallback(async () => {
    if (!policyNameInput.trim() || !policyDescriptionInput.trim()) {
      notifications.toasts.addWarning(
        i18n.translate('xdrManager.policyValidation', {
          defaultMessage: 'Policy name and description are required.',
        })
      );
      return;
    }

    const body = JSON.stringify({
      name: policyNameInput.trim(),
      description: policyDescriptionInput.trim(),
      logLevel: policyLogLevel,
      malwareProtection: policyMalwareProtection,
      fileIntegrityMonitoring: policyFileIntegrity,
      autoUpgrade: policyAutoUpgrade,
      osqueryEnabled: policyOsqueryEnabled,
    });

    setIsSavingPolicy(true);
    try {
      if (editingPolicyId) {
        await http.put<UpsertPolicyResponse>(`/api/xdr_manager/policies/${editingPolicyId}`, { body });
        notifications.toasts.addSuccess(
          i18n.translate('xdrManager.policyUpdated', {
            defaultMessage: 'Policy updated.',
          })
        );
      } else {
        await http.post<UpsertPolicyResponse>('/api/xdr_manager/policies', { body });
        notifications.toasts.addSuccess(
          i18n.translate('xdrManager.policyCreated', {
            defaultMessage: 'Policy created.',
          })
        );
      }

      setIsPolicyFlyoutOpen(false);
      await loadData();
    } catch (error) {
      notifications.toasts.addDanger({
        title: i18n.translate('xdrManager.policySaveError', {
          defaultMessage: 'Unable to save policy',
        }),
        text: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsSavingPolicy(false);
    }
  }, [
    editingPolicyId,
    http,
    loadData,
    notifications.toasts,
    policyAutoUpgrade,
    policyDescriptionInput,
    policyFileIntegrity,
    policyLogLevel,
    policyMalwareProtection,
    policyNameInput,
    policyOsqueryEnabled,
  ]);

  const deletePolicy = useCallback(
    async (policy: XdrPolicy) => {
      const confirmed = window.confirm(
        i18n.translate('xdrManager.policyDeleteConfirm', {
          defaultMessage: 'Delete policy {name}? This only works when no agents are assigned.',
          values: { name: policy.name },
        })
      );

      if (!confirmed) {
        return;
      }

      try {
        await http.delete(`/api/xdr_manager/policies/${policy.id}`);
        notifications.toasts.addSuccess(
          i18n.translate('xdrManager.policyDeleted', {
            defaultMessage: 'Policy deleted.',
          })
        );
        await loadData();
      } catch (error) {
        notifications.toasts.addDanger({
          title: i18n.translate('xdrManager.policyDeleteError', {
            defaultMessage: 'Unable to delete policy',
          }),
          text: error instanceof Error ? error.message : String(error),
        });
      }
    },
    [http, loadData, notifications.toasts]
  );

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
      width: '240px',
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

  const policyColumns = [
    {
      field: 'name',
      name: i18n.translate('xdrManager.policyColumn.name', { defaultMessage: 'Policy' }),
    },
    {
      field: 'description',
      name: i18n.translate('xdrManager.policyColumn.description', { defaultMessage: 'Description' }),
    },
    {
      field: 'logLevel',
      name: i18n.translate('xdrManager.policyColumn.logLevel', { defaultMessage: 'Log level' }),
      render: (value: PolicyLogLevel) => <EuiBadge>{value}</EuiBadge>,
    },
    {
      name: i18n.translate('xdrManager.policyColumn.protection', { defaultMessage: 'Protection controls' }),
      render: (policy: XdrPolicy) => {
        const enabledFeatures = [
          policy.malwareProtection ? 'Malware' : null,
          policy.fileIntegrityMonitoring ? 'FIM' : null,
          policy.osqueryEnabled ? 'Osquery' : null,
          policy.autoUpgrade ? 'Auto upgrade' : null,
        ].filter(Boolean);

        return enabledFeatures.length > 0 ? enabledFeatures.join(', ') : 'None';
      },
    },
    {
      name: i18n.translate('xdrManager.policyColumn.assignedAgents', {
        defaultMessage: 'Assigned agents',
      }),
      render: (policy: XdrPolicy) => agents.filter((agent) => agent.policyId === policy.id).length,
    },
    {
      name: i18n.translate('xdrManager.policyColumn.actions', { defaultMessage: 'Actions' }),
      width: '160px',
      render: (policy: XdrPolicy) => (
        <EuiFlexGroup gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" onClick={() => openEditPolicyFlyout(policy)}>
              {i18n.translate('xdrManager.policyEdit', { defaultMessage: 'Edit' })}
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="xs" color="danger" onClick={() => deletePolicy(policy)}>
              {i18n.translate('xdrManager.policyDelete', { defaultMessage: 'Delete' })}
            </EuiButtonEmpty>
          </EuiFlexItem>
        </EuiFlexGroup>
      ),
    },
  ];

  const filteredAgents = useMemo(() => {
    const query = agentSearchQuery.trim().toLowerCase();
    if (!query) {
      return agents;
    }

    return agents.filter((agent) => {
      const policyName = policyNameById[agent.policyId] ?? agent.policyId;
      return [
        agent.name,
        policyName,
        agent.status,
        agent.version,
        agent.lastSeen,
        agent.tags.join(','),
      ]
        .join(' ')
        .toLowerCase()
        .includes(query);
    });
  }, [agentSearchQuery, agents, policyNameById]);

  const agentPageCount = Math.max(1, Math.ceil(filteredAgents.length / agentPageSize));

  useEffect(() => {
    if (agentPageIndex > agentPageCount - 1) {
      setAgentPageIndex(Math.max(0, agentPageCount - 1));
    }
  }, [agentPageCount, agentPageIndex]);

  const pagedAgents = useMemo(() => {
    const start = agentPageIndex * agentPageSize;
    return filteredAgents.slice(start, start + agentPageSize);
  }, [agentPageIndex, agentPageSize, filteredAgents]);

  const policyPageCount = Math.max(1, Math.ceil(policies.length / policyPageSize));

  useEffect(() => {
    if (policyPageIndex > policyPageCount - 1) {
      setPolicyPageIndex(Math.max(0, policyPageCount - 1));
    }
  }, [policyPageCount, policyPageIndex]);

  const pagedPolicies = useMemo(() => {
    const start = policyPageIndex * policyPageSize;
    return policies.slice(start, start + policyPageSize);
  }, [policyPageIndex, policyPageSize, policies]);

  const pageSizeOptions = [5, 10, 20, 50];

  const headerAction =
    activeTab === 'agents' ? (
      <EuiButton fill onClick={() => setIsEnrollFlyoutOpen(true)} key="enroll">
        {i18n.translate('xdrManager.enrollButton', { defaultMessage: 'Enroll XDR' })}
      </EuiButton>
    ) : (
      <EuiButton fill onClick={openCreatePolicyFlyout} key="createPolicy">
        {i18n.translate('xdrManager.createPolicy', { defaultMessage: 'Create policy' })}
      </EuiButton>
    );

  return (
    <Router basename={basename}>
      <EuiPage restrictWidth={1200}>
        <EuiPageBody component="main">
          <EuiPageHeader
            pageTitle={i18n.translate('xdrManager.pageTitle', { defaultMessage: 'XDR Manager' })}
            rightSideItems={[headerAction]}
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

          <EuiTabs>
            <EuiTab onClick={() => setActiveTab('agents')} isSelected={activeTab === 'agents'}>
              {i18n.translate('xdrManager.tabAgents', { defaultMessage: 'Agents' })}
            </EuiTab>
            <EuiTab onClick={() => setActiveTab('policies')} isSelected={activeTab === 'policies'}>
              {i18n.translate('xdrManager.tabPolicies', { defaultMessage: 'Policy management' })}
            </EuiTab>
          </EuiTabs>

          <EuiSpacer size="m" />

          {activeTab === 'agents' && (
            <EuiPanel>
              <EuiFieldSearch
                value={agentSearchQuery}
                onChange={(event) => {
                  setAgentSearchQuery(event.target.value);
                  setAgentPageIndex(0);
                }}
                placeholder={i18n.translate('xdrManager.searchPlaceholder', { defaultMessage: 'Search...' })}
                fullWidth
              />

              <EuiSpacer size="m" />

              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '55vh' }}>
                <div style={{ display: 'inline-block', minWidth: 1280 }}>
                  <EuiInMemoryTable
                    itemId="id"
                    items={pagedAgents}
                    columns={columns}
                    loading={isLoading}
                    pagination={false}
                    sorting={false}
                  />
                </div>
              </div>

              <EuiSpacer size="s" />

              <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiText size="s">
                        <span>
                          {i18n.translate('xdrManager.rowsPerPage', { defaultMessage: 'Rows per page' })}
                        </span>
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiSelect
                        compressed
                        value={String(agentPageSize)}
                        onChange={(event) => {
                          setAgentPageSize(Number(event.target.value));
                          setAgentPageIndex(0);
                        }}
                        options={pageSizeOptions.map((size) => ({ value: String(size), text: String(size) }))}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>

                <EuiFlexItem grow={false}>
                  <EuiPagination
                    pageCount={agentPageCount}
                    activePage={agentPageIndex}
                    onPageClick={setAgentPageIndex}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          )}

          {activeTab === 'policies' && (
            <EuiPanel>
              <EuiText size="s" color="subdued">
                <p>
                  {i18n.translate('xdrManager.policySectionDescription', {
                    defaultMessage:
                      'Define endpoint behavior profiles: protection controls, telemetry verbosity, and upgrade posture.',
                  })}
                </p>
              </EuiText>

              <EuiSpacer size="m" />

              <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '55vh' }}>
                <div style={{ display: 'inline-block', minWidth: 1280 }}>
                  <EuiInMemoryTable
                    itemId="id"
                    items={pagedPolicies}
                    columns={policyColumns}
                    loading={isLoading}
                    pagination={false}
                    sorting={false}
                  />
                </div>
              </div>

              <EuiSpacer size="s" />

              <EuiFlexGroup alignItems="center" justifyContent="spaceBetween" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                    <EuiFlexItem grow={false}>
                      <EuiText size="s">
                        <span>
                          {i18n.translate('xdrManager.rowsPerPage', { defaultMessage: 'Rows per page' })}
                        </span>
                      </EuiText>
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiSelect
                        compressed
                        value={String(policyPageSize)}
                        onChange={(event) => {
                          setPolicyPageSize(Number(event.target.value));
                          setPolicyPageIndex(0);
                        }}
                        options={pageSizeOptions.map((size) => ({ value: String(size), text: String(size) }))}
                      />
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexItem>

                <EuiFlexItem grow={false}>
                  <EuiPagination
                    pageCount={policyPageCount}
                    activePage={policyPageIndex}
                    onPageClick={setPolicyPageIndex}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          )}

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

          {isPolicyFlyoutOpen && (
            <EuiFlyout onClose={() => setIsPolicyFlyoutOpen(false)} ownFocus>
              <EuiFlyoutHeader hasBorder>
                <EuiTitle size="m">
                  <h2>
                    {editingPolicyId
                      ? i18n.translate('xdrManager.editPolicyTitle', { defaultMessage: 'Edit policy' })
                      : i18n.translate('xdrManager.createPolicyTitle', {
                          defaultMessage: 'Create policy',
                        })}
                  </h2>
                </EuiTitle>
              </EuiFlyoutHeader>

              <EuiFlyoutBody>
                <EuiForm component="form">
                  <EuiFormRow
                    label={i18n.translate('xdrManager.policyField.name', {
                      defaultMessage: 'Policy name',
                    })}
                  >
                    <EuiFieldText
                      value={policyNameInput}
                      onChange={(event) => setPolicyNameInput(event.target.value)}
                      placeholder="Linux production baseline"
                    />
                  </EuiFormRow>

                  <EuiFormRow
                    label={i18n.translate('xdrManager.policyField.description', {
                      defaultMessage: 'Description',
                    })}
                  >
                    <EuiFieldText
                      value={policyDescriptionInput}
                      onChange={(event) => setPolicyDescriptionInput(event.target.value)}
                      placeholder="Balanced detection and telemetry for production workloads."
                    />
                  </EuiFormRow>

                  <EuiFormRow
                    label={i18n.translate('xdrManager.policyField.logLevel', {
                      defaultMessage: 'Telemetry log level',
                    })}
                  >
                    <EuiSelect
                      value={policyLogLevel}
                      onChange={(event) => setPolicyLogLevel(event.target.value as PolicyLogLevel)}
                      options={[
                        { value: 'minimal', text: 'Minimal' },
                        { value: 'standard', text: 'Standard' },
                        { value: 'verbose', text: 'Verbose' },
                      ]}
                    />
                  </EuiFormRow>

                  <EuiHorizontalRule margin="m" />

                  <EuiSwitch
                    label={i18n.translate('xdrManager.policyField.malware', {
                      defaultMessage: 'Malware prevention',
                    })}
                    checked={policyMalwareProtection}
                    onChange={(event) => setPolicyMalwareProtection(event.target.checked)}
                  />
                  <EuiSpacer size="s" />
                  <EuiSwitch
                    label={i18n.translate('xdrManager.policyField.fim', {
                      defaultMessage: 'File integrity monitoring',
                    })}
                    checked={policyFileIntegrity}
                    onChange={(event) => setPolicyFileIntegrity(event.target.checked)}
                  />
                  <EuiSpacer size="s" />
                  <EuiSwitch
                    label={i18n.translate('xdrManager.policyField.osquery', {
                      defaultMessage: 'Osquery module',
                    })}
                    checked={policyOsqueryEnabled}
                    onChange={(event) => setPolicyOsqueryEnabled(event.target.checked)}
                  />
                  <EuiSpacer size="s" />
                  <EuiSwitch
                    label={i18n.translate('xdrManager.policyField.autoUpgrade', {
                      defaultMessage: 'Auto-upgrade agents',
                    })}
                    checked={policyAutoUpgrade}
                    onChange={(event) => setPolicyAutoUpgrade(event.target.checked)}
                  />
                </EuiForm>
              </EuiFlyoutBody>

              <EuiFlyoutFooter>
                <EuiButtonEmpty onClick={() => setIsPolicyFlyoutOpen(false)}>
                  {i18n.translate('xdrManager.cancelPolicyButton', { defaultMessage: 'Cancel' })}
                </EuiButtonEmpty>
                <EuiButton fill onClick={savePolicy} isLoading={isSavingPolicy}>
                  {i18n.translate('xdrManager.savePolicyButton', { defaultMessage: 'Save policy' })}
                </EuiButton>
              </EuiFlyoutFooter>
            </EuiFlyout>
          )}
        </EuiPageBody>
      </EuiPage>
    </Router>
  );
};
