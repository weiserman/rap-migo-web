import { reactive } from 'vue';

const dialogState = reactive({
  showDialog: null,
});

let pendingResolve = null;

export function useDialog() {
  return {
    state: dialogState,
    resolve: (value) => {
      if (pendingResolve) {
        pendingResolve(value);
        pendingResolve = null;
      }
    },
  };
}

/**
 * Override window.alert, window.confirm, window.prompt
 * to use the CustomDialog component.
 */
export function initWindowOverrides() {
  window.alert = (message) => {
    if (dialogState.showDialog) {
      return dialogState.showDialog({ message, title: 'Info', okLabel: 'OK' });
    }
  };

  window.confirm = (message) => {
    if (dialogState.showDialog) {
      return dialogState.showDialog({
        message,
        title: 'Confirm',
        okLabel: 'OK',
        showCancel: true,
      });
    }
    return Promise.resolve(false);
  };

  window.prompt = (message, defaultValue) => {
    if (dialogState.showDialog) {
      return dialogState.showDialog({
        message,
        title: 'Input',
        okLabel: 'OK',
        showCancel: true,
        inputMode: true,
        inputValue: defaultValue || '',
      });
    }
    return Promise.resolve(null);
  };
}
