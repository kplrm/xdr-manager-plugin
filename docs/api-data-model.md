# xdr-coordinator API And Data Model

This document records the current coordinator route families and the data objects they own.

## Agent-Facing Routes

These routes are consumed directly by `xdr-agent`.

### Enrollment and liveness
- `POST /api/v1/agents/enroll`
- `POST /api/v1/agents/heartbeat`
- `GET /api/v1/agents/commands`

### Semantics
- Enrollment requires a bearer token that matches a stored enrollment token record.
- Heartbeat updates the agent saved object and may return pending commands.
- Fast command polling does not mutate `lastSeen`; it is safe to call frequently.

## Operator-Facing Routes

These routes are consumed by coordinator UI flows and management tooling.

### Fleet and policy
- `GET /api/xdr_manager/agents`
- `POST /api/xdr_manager/agents/enroll`
- `POST /api/xdr_manager/agents/{id}/action`
- `DELETE /api/xdr_manager/agents/{id}`
- policy CRUD under `/api/xdr_manager/*`

### Enrollment tokens
- `POST /api/xdr_manager/enrollment_tokens`
- `GET /api/xdr_manager/enrollment_tokens`
- `GET /api/xdr_manager/enrollment_tokens/{token}/status`
- `DELETE /api/xdr_manager/enrollment_tokens/{token}`

### Telemetry views
- `GET /api/xdr_manager/telemetry/host`
- `GET /api/xdr_manager/telemetry/processes`
- `GET /api/xdr_manager/telemetry/network`

## Saved Object Ownership

Coordinator registers these hidden saved object types:

- `xdr-agent`
- `xdr-enrollment-token`

### `xdr-agent`
Used for fleet control metadata such as:

- name
- policy id
- status
- last seen timestamp
- tags
- version

### `xdr-enrollment-token`
Used for:

- token value
- policy id
- created timestamp
- consumed timestamp
- consumed agent id
- consumed hostname

## Index Ownership

Coordinator installs templates and ISM policies for these hidden index families:

- `.xdr-agent-telemetry-*`
- `.xdr-agent-security-*`
- `.xdr-agent-logs-*`

Each currently receives:

- hidden index setting
- one shard
- zero replicas for local/dev defaults
- 90-day retention through ISM

## Dashboard And Index Pattern Ownership

Coordinator installs:

- a shared hidden telemetry index pattern for `.xdr-agent-telemetry-*`
- hidden management index patterns for `.xdr-agent-security-*` and `.xdr-agent-logs-*`
- dashboard and visualization saved objects for the current telemetry tabs

## Compatibility Notes

- Coordinator currently reads YARA rollout request and status records produced by `xdr-defense` so it can return rollout commands through the command-polling flow.
- Coordinator should not become the authoritative store for defense bundle state.