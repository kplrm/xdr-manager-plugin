import { PluginInitializerContext } from '../../../src/core/server';
import { XdrManagerPlugin } from './plugin';

export function plugin(initializerContext: PluginInitializerContext) {
  return new XdrManagerPlugin(initializerContext);
}

export { XdrManagerPluginSetup, XdrManagerPluginStart } from './types';
