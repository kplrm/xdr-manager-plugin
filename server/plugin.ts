import {
  CoreSetup,
  CoreStart,
  Logger,
  Plugin,
  PluginInitializerContext,
} from '../../../src/core/server';
import { defineRoutes } from './routes';
import { XdrManagerPluginSetup, XdrManagerPluginStart } from './types';

export class XdrManagerPlugin implements Plugin<XdrManagerPluginSetup, XdrManagerPluginStart> {
  private readonly logger: Logger;

  constructor(initializerContext: PluginInitializerContext) {
    this.logger = initializerContext.logger.get();
  }

  public setup(core: CoreSetup): XdrManagerPluginSetup {
    this.logger.debug('xdr_manager: setup');
    const router = core.http.createRouter();
    defineRoutes(router);
    return {};
  }

  public start(core: CoreStart): XdrManagerPluginStart {
    this.logger.debug('xdr_manager: start');
    return {};
  }

  public stop() {}
}
