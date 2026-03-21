# XDR Manager

OpenSearch Dashboards plugin for enrolling, managing, upgrading, and monitoring xdr-agent endpoints.

## Requirements

- OpenSearch must already be deployed.
- OpenSearch Dashboards must already be deployed and connected to that OpenSearch cluster.
- Supported plugin release target: OpenSearch Dashboards `3.5.0`.

This plugin does not deploy OpenSearch or OpenSearch Dashboards for you.

## Current features

- Agent inventory with `healthy`, `offline`, and `unseen` states.
- Policy management from the UI: create, edit, and delete policies.
- Enrollment token generation and token consumption tracking.
- Agent-facing APIs for enroll, heartbeat, command polling, and telemetry ingestion.
- Agent removal and queued upgrade command delivery.
- Latest xdr-agent version lookup from GitHub Releases.
- Telemetry dashboards for host, process, and network data from `.xdr-agent-telemetry-*` indices.
- Saved object persistence for agents and enrollment tokens.

## Deploy as a Docker container (recommended)

Pre-built multi-platform images (`linux/amd64`, `linux/arm64`) are published to the GitHub Container Registry alongside each release.

**`docker run`:**

```bash
docker run -d \
  --name opensearch-dashboards \
  -p 5601:5601 \
  -e 'OPENSEARCH_HOSTS=["http://<opensearch-host>:9200"]' \
  -e DISABLE_SECURITY_DASHBOARDS_PLUGIN=true \
  ghcr.io/kplrm/opensearch-dashboards-xdr:latest
```

**`docker-compose.yml`:**

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

Available image tags:
- `ghcr.io/kplrm/opensearch-dashboards-xdr:latest` — most recent release
- `ghcr.io/kplrm/opensearch-dashboards-xdr:v0.1.0` — pinned version

## Install plugin on existing OpenSearch Dashboards

Run this on the OpenSearch Dashboards host:

```bash
VERSION=<plugin-release-version>
OSD_VERSION=3.5.0
sudo /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin install \
	"https://github.com/kplrm/xdr-manager-plugin/releases/download/v${VERSION}/xdr-manager-plugin_${VERSION}_osd-${OSD_VERSION}.zip"
sudo systemctl restart opensearch-dashboards
```

Then open OpenSearch Dashboards and verify that **XDR Manager** appears in the left navigation.

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
