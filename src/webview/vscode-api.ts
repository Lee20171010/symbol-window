import { WebviewMessage } from '../shared/common/types';

declare global {
    interface Window {
        acquireVsCodeApi: () => any;
    }
}

const vscodeApi = window.acquireVsCodeApi();

export const vscode = {
    postMessage: (message: WebviewMessage | any) => {
        vscodeApi.postMessage(message);
    },
    getState: () => {
        return vscodeApi.getState();
    },
    setState: (state: any) => {
        vscodeApi.setState(state);
    }
};
