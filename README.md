# xdr-coordinator

`xdr-coordinator` is the OpenSearch Dashboards plugin that owns fleet lifecycle and telemetry operations for `xdr-agent`.

It is the control-plane surface for enrollment, heartbeats, command polling, operator fleet views, telemetry dashboards, and index lifecycle setup.

## Scope

`xdr-coordinator` owns:

- agent enrollment and enrollment token workflows
- heartbeat and lightweight command polling endpoints
- agent records and operator fleet APIs
- telemetry/security/log index lifecycle setup in OpenSearch
- telemetry dashboard installation and telemetry query routes
- rollout command hints surfaced to agents through command polling

It does not own:

- rule authoring or bundle signing
- prevention policy content design
- endpoint detection logic

Those concerns belong to `xdr-defense` and `xdr-agent`.

## Read Next

- `docs/architecture.md`
- `docs/api-data-model.md`

## Current Implementation Notes

- Plugin id: `xdrCoordinator`
- Target OpenSearch Dashboards version: `3.5.0`
- Current repo metadata is not fully aligned: `package.json` and `opensearch_dashboards.json` are `0.4.0`, while `VERSION` is `0.4.1` for packaging flow

## Core Behaviors

### Fleet lifecycle
- Issues and tracks enrollment tokens.
- Accepts agent enrollment requests under `/api/v1/agents/enroll`.
- Accepts heartbeats under `/api/v1/agents/heartbeat`.
- Serves lightweight command polling under `/api/v1/agents/commands`.
- Maintains agent status through hidden saved objects.

### Operator APIs
- Exposes fleet and policy operations under `/api/xdr_manager/*`.
- Supports agent list, removal, enrollment token management, and upgrade action workflows.

### Telemetry operations
- Installs hidden index patterns for telemetry, security, and logs.
- Installs dashboards and visualizations for the current telemetry surface.
- Installs ISM policies and templates for `.xdr-agent-telemetry-*`, `.xdr-agent-security-*`, and `.xdr-agent-logs-*`.
- Exposes telemetry aggregation routes for host, process, and network views.

### Cross-plugin interaction
- Uses rollout state from `xdr-defense` to surface pending YARA rollout commands to agents.
- Does not build or sign rule content itself.

## Build

```bash
cd /home/kplrm/github/xdr-coordinator
yarn build --opensearch-dashboards-version 3.5.0
```

## Documentation Rule

Keep the README as the repo overview.
Put route details, saved object ownership, and index behavior in the docs directory so they stay authoritative and are easier to maintain.
