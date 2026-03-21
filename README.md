# XDR Manager

OpenSearch Dashboards plugin for enrolling, managing, upgrading, and monitoring xdr-agent endpoints.

## Requirements

- OpenSearch is already running.
- OpenSearch Dashboards is already running and connected to that OpenSearch cluster.
- OpenSearch Dashboards version: `3.5.0`.

## Current features

- Agent inventory with `healthy`, `offline`, and `unseen` states.
- Policy management from the UI: create, edit, and delete policies.
- Enrollment token generation and token consumption tracking.
- Agent-facing APIs for enroll, heartbeat, command polling, and telemetry ingestion.
- Agent removal and queued upgrade command delivery.
- Latest xdr-agent version lookup from GitHub Releases.
- Telemetry dashboards for host, process, and network data from `.xdr-agent-telemetry-*` indices.
- Saved object persistence for agents and enrollment tokens.

## Deploy

### Option 1 — Replace the OpenSearch Dashboards container (recommended)

Pre-built images with the plugin already installed are published to the GitHub Container Registry for every release. Replace your existing `opensearch-dashboards` service with this image — no plugin installation step needed.

Update your `docker-compose.yml`:

```yaml
services:
  opensearch-dashboards:
    image: ghcr.io/kplrm/opensearch-dashboards-xdr:latest
    container_name: opensearch-dashboards
    ports:
      - 5601:5601
    environment:
      - OPENSEARCH_HOSTS=["http://opensearch-node1:9200"]
      - DISABLE_SECURITY_DASHBOARDS_PLUGIN=true
    networks:
      - opensearch-net
    depends_on:
      - opensearch-node1
```

Then restart the service:

```bash
docker compose up -d opensearch-dashboards
```

Available image tags:
- `ghcr.io/kplrm/opensearch-dashboards-xdr:latest` — most recent release
- `ghcr.io/kplrm/opensearch-dashboards-xdr:v0.1.0` — pinned version

### Option 2 — Install into the running container

If you prefer to keep your existing `opensearch-dashboards` container, install the plugin into it directly:

```bash
VERSION=0.1.0
OSD_VERSION=3.5.0

docker exec opensearch-dashboards \
  /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin install --allow-root \
  "https://github.com/kplrm/xdr-manager-plugin/releases/download/v${VERSION}/xdr-manager-plugin_${VERSION}_osd-${OSD_VERSION}.zip"

docker restart opensearch-dashboards
```

### Option 3 — Install on a bare-metal OpenSearch Dashboards

```bash
VERSION=0.1.0
OSD_VERSION=3.5.0
sudo /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin install \
  "https://github.com/kplrm/xdr-manager-plugin/releases/download/v${VERSION}/xdr-manager-plugin_${VERSION}_osd-${OSD_VERSION}.zip"
sudo systemctl restart opensearch-dashboards
```

After any of the above, open OpenSearch Dashboards and verify that **XDR Manager** appears in the left navigation.

## Build from source

From the OpenSearch Dashboards root:

```bash
yarn osd bootstrap --single-version=loose
cd plugins/xdr-manager-plugin
cat VERSION
yarn build
```

The ZIP artifact is created in `plugins/xdr-manager-plugin/build/`.

The plugin version is defined in `VERSION`. The build syncs `package.json` and `opensearch_dashboards.json` from that file.

## xdr-agent enrollment

1. Open **XDR Manager**.
2. Create or select a policy.
3. Generate an enrollment token.
4. Set these values in `xdr-agent/config/config.json`:

```json
{
	"control_plane_url": "http://<opensearch-dashboards-host>:5601",
	"enrollment_path": "/api/v1/agents/enroll",
	"enrollment_token": "xdr_enroll_<generated-token>",
	"policy_id": "<policy-id>"
}
```

The agent will then enroll, send heartbeats, poll for commands, and ship telemetry to the control plane.


## Build from source

From the OpenSearch Dashboards root:

```bash
yarn osd bootstrap --single-version=loose
cd plugins/xdr-manager-plugin
cat VERSION
yarn build
```

The ZIP artifact is created in `plugins/xdr-manager-plugin/build/`.

The plugin version is defined in `VERSION`. The build syncs `package.json` and `opensearch_dashboards.json` from that file.

## xdr-agent enrollment

1. Open **XDR Manager**.
2. Create or select a policy.
3. Generate an enrollment token.
4. Set these values in `xdr-agent/config/config.json`:

```json
{
	"control_plane_url": "http://<opensearch-dashboards-host>:5601",
	"enrollment_path": "/api/v1/agents/enroll",
	"enrollment_token": "xdr_enroll_<generated-token>",
	"policy_id": "<policy-id>"
}
```

The agent will then enroll, send heartbeats, poll for commands, and ship telemetry to the control plane.
