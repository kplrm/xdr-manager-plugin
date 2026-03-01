import { AppMountParameters, CoreSetup, CoreStart, Plugin } from '../../../src/core/public';
import { PLUGIN_ID, PLUGIN_NAME } from '../common';
import { XdrManagerPluginSetup, XdrManagerPluginStart } from './types';

export class XdrManagerPlugin implements Plugin<XdrManagerPluginSetup, XdrManagerPluginStart> {
  public setup(core: CoreSetup): XdrManagerPluginSetup {
    core.application.register({
      id: PLUGIN_ID,
      title: PLUGIN_NAME,
      category: {
        id: 'opensearch',
        label: 'OpenSearch Plugins',
        order: 2000,
      },
      async mount(params: AppMountParameters) {
        const { renderApp } = await import('./application');
        const [coreStart] = await core.getStartServices();
        return renderApp(coreStart, params);
      },
    });

    return {};
  }

  public start(core: CoreStart): XdrManagerPluginStart {
    return {};
  }

  public stop() {}
}
