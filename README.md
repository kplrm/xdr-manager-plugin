# XDR Manager

A minimal OpenSearch Dashboards plugin that provides a Fleet-like control surface for managing XDR agents.

## Inspiration and product direction

This MVP borrows proven interaction patterns from **Wazuh Agent** and **Elastic Agent/Fleet** while staying intentionally small:

- Agent enrollment workflow (name + policy + tags).
- Policy-driven management model.
- Centralized agent inventory with status and last-seen health.
- Remote actions from the control plane (restart, isolate, upgrade).

## MVP scope (for fast testing)

This first version is intentionally limited to validate UX and API wiring:

- In-memory server-side data store (no persistence yet).
- `GET /api/xdr_manager/agents` for inventory + policies.
- `POST /api/xdr_manager/agents/enroll` to enroll a new agent.
- `POST /api/xdr_manager/enrollment_tokens` to generate enrollment tokens per policy.
- `POST /api/v1/agents/enroll` agent-facing enrollment endpoint with bearer token validation.
- `POST /api/xdr_manager/agents/{id}/action` for remote actions.
- React/EUI UI with table search, action buttons, and enrollment flyout.

Out of scope for this MVP:

- Real endpoint transport or message queue.
- OpenSearch index persistence / Saved Objects.
- Authentication/authorization model for control actions.
- Upgrade orchestration and package artifact management.

## Local development

From OpenSearch Dashboards root:

```bash
yarn osd bootstrap --single-version=loose
yarn start --no-base-path --opensearch.hosts=http://localhost:9200 --opensearch.ignoreVersionMismatch=true
```

Then open OpenSearch Dashboards and navigate to **XDR Manager** in the app menu.

## Build distributable plugin ZIP

From `plugins/xdr-manager-plugin`:

```bash
yarn build
```

The ZIP artifact is created under `plugins/xdr-manager-plugin/build/`.

## xdr-agent compatibility flow

1. Open the **Enroll XDR** flyout and select a policy.
2. Generate an enrollment token.
3. Set these values in `xdr-agent/config/config.json`:

```json
{
	"control_plane_url": "http://<opensearch-dashboards-host>:5601",
	"enrollment_path": "/api/v1/agents/enroll",
	"enrollment_token": "xdr_enroll_<generated-token>",
	"policy_id": "<same-policy-id-used-for-token>"
}
```

If the token is missing/invalid, or if `policy_id` does not match the token policy, enrollment is rejected.
