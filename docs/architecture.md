# xdr-coordinator Architecture

`xdr-coordinator` is the fleet and telemetry operations plugin for the XDR stack.

It sits between `xdr-agent`, OpenSearch, and the operator UI. Its job is to keep endpoint lifecycle and telemetry operations coherent without taking over rule management or endpoint enforcement.

## What It Owns

### Agent-facing control-plane routes
- Enrollment
- Heartbeat
- Fast command polling
- Telemetry and security intake routes consumed by the agent runtime

### Operator-facing fleet routes
- Agent listing and lifecycle actions
- Enrollment token creation, listing, status, and revocation
- Policy CRUD for coordinator-managed fleet policy objects
- Telemetry views used by the UI

### OpenSearch bootstrap work
- Hidden saved object types for agent and enrollment-token records
- Hidden index patterns for telemetry, security, and logs
- Telemetry dashboards and visualizations
- ISM policies and index templates for the agent-facing index families

## What It Does Not Own

- Detection and prevention content authoring
- Bundle signing and artifact curation
- Endpoint-side detection logic
- Wrapper navigation concerns

Those responsibilities belong to `xdr-defense`, `xdr-agent`, and `xdr-security` respectively.

## Runtime Structure

### Setup phase
- Registers hidden saved object types for agents and enrollment tokens.
- Creates the HTTP router and registers route families.

### Start phase
- Creates the internal saved object repository used by route handlers.
- Installs telemetry dashboards and hidden index patterns.
- Installs ISM policies and index templates for telemetry, security, and agent logs.

## Persistence Model

### Saved objects
Coordinator uses hidden saved objects for low-volume control metadata:

- `xdr-agent`
- `xdr-enrollment-token`

This is where fleet records and enrollment token lifecycle live.

### OpenSearch indices
Coordinator also assumes ownership of operational index lifecycle for:

- `.xdr-agent-telemetry-*`
- `.xdr-agent-security-*`
- `.xdr-agent-logs-*`

These indices are hidden and receive templates plus 90-day ISM retention policies.

## Cross-Repo Interaction

### With `xdr-agent`
- Agents enroll and heartbeat through coordinator routes.
- Agents poll for pending commands.
- Agents ship telemetry, security events, and logs into the index families coordinator prepares.

### With `xdr-defense`
- Coordinator does not author content.
- Coordinator can surface pending rollout commands to agents based on rollout state stored by `xdr-defense`.

### With `xdr-security`
- Coordinator remains the owner of fleet logic.
- The wrapper plugin should only provide navigation grouping.

## Design Rules

- Keep fleet metadata small and explicit.
- Keep large-volume event data in OpenSearch indices, not saved objects.
- Keep compatibility logic near the route layer when bridging rollout behavior from `xdr-defense` to agents.
- Do not duplicate defense bundle logic here.