/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ADK_API_BASE_URL?: string;
  readonly VITE_ADK_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
