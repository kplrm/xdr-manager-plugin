/**
 * Sets up an OpenSearch Index State Management (ISM) policy for XDR telemetry
 * indices and an index template that auto-attaches the policy to new daily
 * indices matching `.xdr-agent-telemetry-*`.
 *
 * The ISM policy retains data for 90 days, then deletes the index.
 *
 * Called once from plugin.start(). Idempotent — skips creation if the
 * policy / template already exist.
 */

import { Logger } from '../../../src/core/server';

const ISM_POLICY_ID = 'xdr-telemetry-retention';
const INDEX_TEMPLATE_NAME = 'xdr-telemetry-template';
const INDEX_PATTERN = '.xdr-agent-telemetry-*';

/**
 * The ISM policy definition:
 *   hot (current) → 90 days → delete
 */
function buildIsmPolicy() {
  return {
    policy: {
      description: 'Retain XDR telemetry indices for 90 days, then delete.',
      default_state: 'hot',
      states: [
        {
          name: 'hot',
          actions: [],
          transitions: [
            {
              state_name: 'delete',
              conditions: {
                min_index_age: '90d',
              },
            },
          ],
        },
        {
          name: 'delete',
          actions: [
            {
              delete: {},
            },
          ],
          transitions: [],
        },
      ],
      ism_template: [
        {
          index_patterns: [INDEX_PATTERN],
          priority: 100,
        },
      ],
    },
  };
}

/**
 * The index template ensures every new `.xdr-agent-telemetry-*` index gets:
 *   - number_of_shards: 1, number_of_replicas: 0
 *   - hidden: true
 *   - The correct field mappings
 *   - The ISM policy auto-attached via opendistro.index_state_management.policy_id
 */
function buildIndexTemplate() {
  return {
    index_patterns: [INDEX_PATTERN],
    priority: 100,
    template: {
      settings: {
        number_of_shards: 1,
        number_of_replicas: 0,
        'index.hidden': true,
        'opendistro.index_state_management.policy_id': ISM_POLICY_ID,
      },
      mappings: {
        properties: {
          '@timestamp': { type: 'date' },
          'event.type': { type: 'keyword' },
          'event.category': { type: 'keyword' },
          'event.kind': { type: 'keyword' },
          'event.severity': { type: 'integer' },
          'event.module': { type: 'keyword' },
          'agent.id': { type: 'keyword' },
          'host.hostname': { type: 'keyword' },
          tags: { type: 'keyword' },
          indexed_at: { type: 'date' },
          'threat.tactic.name': { type: 'keyword' },
          'threat.technique.id': { type: 'keyword' },
          'threat.technique.subtechnique.id': { type: 'keyword' },
          payload: {
            type: 'object',
            dynamic: true,
            properties: {
              system: {
                properties: {
                  memory: {
                    properties: {
                      total: { type: 'long' },
                      free: { type: 'long' },
                      cached: { type: 'long' },
                      buffer: { type: 'long' },
                      used: {
                        properties: {
                          bytes: { type: 'long' },
                          pct: { type: 'float' },
                        },
                      },
                      actual: {
                        properties: {
                          free: { type: 'long' },
                        },
                      },
                      swap: {
                        properties: {
                          total: { type: 'long' },
                          free: { type: 'long' },
                          used: {
                            properties: {
                              bytes: { type: 'long' },
                              pct:   { type: 'float' },
                            },
                          },
                        },
                      },
                    },
                  },
                  cpu: {
                    properties: {
                      total: { properties: { pct: { type: 'float' } } },
                      user: { properties: { pct: { type: 'float' } } },
                      system: { properties: { pct: { type: 'float' } } },
                      idle: { properties: { pct: { type: 'float' } } },
                      iowait: { properties: { pct: { type: 'float' } } },
                      steal: { properties: { pct: { type: 'float' } } },
                      cores: { type: 'integer' },
                    },
                  },
                  diskio: {
                    properties: {
                      read:  { properties: { bytes: { type: 'long' }, ops: { type: 'long' } } },
                      write: { properties: { bytes: { type: 'long' }, ops: { type: 'long' } } },
                    },
                  },
                  netio: {
                    properties: {
                      in:  { properties: { bytes: { type: 'long' }, errors: { type: 'long' } } },
                      out: { properties: { bytes: { type: 'long' }, errors: { type: 'long' } } },
                    },
                  },
                  disk: {
                    properties: {
                      root: {
                        properties: {
                          total: { type: 'long' },
                          free:  { type: 'long' },
                          used:  { properties: { bytes: { type: 'long' }, pct: { type: 'float' } } },
                        },
                      },
                      home: {
                        properties: {
                          total: { type: 'long' },
                          free:  { type: 'long' },
                          used:  { properties: { bytes: { type: 'long' }, pct: { type: 'float' } } },
                        },
                      },
                      var: {
                        properties: {
                          total: { type: 'long' },
                          free:  { type: 'long' },
                          used:  { properties: { bytes: { type: 'long' }, pct: { type: 'float' } } },
                        },
                      },
                    },
                  },
                },
              },
              process: {
                properties: {
                  pid: { type: 'integer' },
                  ppid: { type: 'integer' },
                  name: { type: 'keyword' },
                  executable: { type: 'keyword' },
                  command_line: { type: 'keyword' },
                  cpu: {
                    properties: {
                      pct: { type: 'float' },
                    },
                  },
                  state: { type: 'keyword' },
                  start_time: { type: 'date' },
                },
              },
              network: {
                properties: {
                  type: { type: 'keyword' },
                  transport: { type: 'keyword' },
                  direction: { type: 'keyword' },
                  protocol: { type: 'keyword' },
                  state: { type: 'keyword' },
                  local_addr: { type: 'ip' },
                  local_port: { type: 'integer' },
                  remote_addr: { type: 'ip' },
                  remote_port: { type: 'integer' },
                  inode: { type: 'long' },
                  uid: { type: 'integer' },
                },
              },
              source: {
                properties: {
                  ip: { type: 'ip' },
                  port: { type: 'integer' },
                },
              },
              destination: {
                properties: {
                  ip: { type: 'ip' },
                  port: { type: 'integer' },
                },
              },
            },
          },
        },
      },
    },
  };
}

export async function installTelemetryIsmPolicy(
  opensearchClient: any,
  logger: Logger
): Promise<void> {
  // ── 1. Create or update ISM policy ────────────────────────────────────
  try {
    await opensearchClient.transport.request({
      method: 'GET',
      path: `/_plugins/_ism/policies/${ISM_POLICY_ID}`,
    });
    logger.debug(`xdr_manager: ISM policy [${ISM_POLICY_ID}] already exists`);
  } catch (getErr: any) {
    if (getErr?.statusCode === 404 || getErr?.meta?.statusCode === 404) {
      try {
        await opensearchClient.transport.request({
          method: 'PUT',
          path: `/_plugins/_ism/policies/${ISM_POLICY_ID}`,
          body: buildIsmPolicy(),
        });
        logger.info(`xdr_manager: created ISM policy [${ISM_POLICY_ID}] (90-day retention)`);
      } catch (createErr) {
        logger.warn(`xdr_manager: failed to create ISM policy: ${createErr}`);
      }
    } else {
      logger.warn(`xdr_manager: failed to check ISM policy: ${getErr}`);
    }
  }

  // ── 2. Create or update composable index template ─────────────────────
  try {
    await opensearchClient.indices.putIndexTemplate({
      name: INDEX_TEMPLATE_NAME,
      body: buildIndexTemplate(),
    });
    logger.info(`xdr_manager: installed index template [${INDEX_TEMPLATE_NAME}]`);
  } catch (err) {
    logger.warn(`xdr_manager: failed to install index template: ${err}`);
  }
}
