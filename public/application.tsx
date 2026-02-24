import React from 'react';
import ReactDOM from 'react-dom';
import { AppMountParameters, CoreStart } from '../../../src/core/public';
import { XdrManagerApp } from './components/app';

export const renderApp = ({ http, notifications }: CoreStart, { appBasePath, element }: AppMountParameters) => {
  ReactDOM.render(
    <XdrManagerApp basename={appBasePath} http={http} notifications={notifications} />,
    element
  );

  return () => ReactDOM.unmountComponentAtNode(element);
};
