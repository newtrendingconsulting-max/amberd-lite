/**
 * Loads and opens Google Picker.
 *
 * The Picker runs in Google's own iframe: the user browses their Drive there,
 * and Amberd Lite only learns about the files they explicitly pick. Files uploaded
 * through the Picker's Upload tab are likewise shared with Amberd Lite only.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    gapi?: any;
    google?: any;
  }
}

export interface PickedFile {
  id: string;
  name: string;
  mimeType: string;
}

const PICKABLE_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/csv',
  'application/vnd.google-apps.spreadsheet',
  'application/vnd.google-apps.document',
].join(',');

let loading: Promise<void> | null = null;

const loadPickerApi = (): Promise<void> => {
  if (window.google?.picker) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.async = true;
    script.onload = () => window.gapi.load('picker', { callback: () => resolve(), onerror: () => reject(new Error('Google Picker failed to load')) });
    script.onerror = () => {
      loading = null;
      reject(new Error('Could not load Google Picker — check your internet connection'));
    };
    document.body.appendChild(script);
  });
  return loading;
};

export const openGooglePicker = async (settings: {
  accessToken: string;
  apiKey: string;
  appId: string;
}): Promise<PickedFile[] | null> => {
  await loadPickerApi();
  const { picker } = window.google;
  return new Promise((resolve) => {
    const docsView = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(PICKABLE_MIME_TYPES)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false)
      .setMode(picker.DocsViewMode.LIST);
    const uploadView = new picker.DocsUploadView().setIncludeFolders(false);

    new picker.PickerBuilder()
      .setTitle('Select the files Amberd Lite may read')
      .addView(docsView)
      .addView(uploadView)
      .enableFeature(picker.Feature.MULTISELECT_ENABLED)
      .setOAuthToken(settings.accessToken)
      .setDeveloperKey(settings.apiKey)
      // The app id ties picked files to this project's drive.file grant.
      .setAppId(settings.appId)
      .setCallback((data: any) => {
        if (data.action === picker.Action.PICKED) {
          resolve(
            (data.docs ?? []).map((doc: any) => ({ id: doc.id, name: doc.name, mimeType: doc.mimeType })),
          );
        } else if (data.action === picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build()
      .setVisible(true);
  });
};
