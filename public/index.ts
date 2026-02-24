import './index.scss';

import { XdrManagerPlugin } from './plugin';

export function plugin() {
  return new XdrManagerPlugin();
}

export { XdrManagerPluginSetup, XdrManagerPluginStart } from './types';
