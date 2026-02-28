import {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '../../../src/core/server';
import { defineRoutes } from './routes';
import { installTelemetryDashboard } from './telemetry_dashboard_installer';
import { XdrManagerPluginSetup, XdrManagerPluginStart } from './types';

export class XdrManagerPlugin implements Plugin<XdrManagerPluginSetup, XdrManagerPluginStart> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup): XdrManagerPluginSetup {
    this.logger.debug('xdr_manager: setup');
    const router = core.http.createRouter();
    defineRoutes(router, this.logger);
    return {};
  }

  public start(core: CoreStart): XdrManagerPluginStart {
    this.logger.debug('xdr_manager: start');

    // Install the out-of-the-box telemetry dashboard (index-pattern + visualizations + dashboard)
    const repo = core.savedObjects.createInternalRepository();
    installTelemetryDashboard(repo, this.logger).catch((err) =>
      this.logger.error(`xdr_manager: telemetry dashboard install failed: ${err}`)
    );

    return {};
  }

  public stop() {}
}
