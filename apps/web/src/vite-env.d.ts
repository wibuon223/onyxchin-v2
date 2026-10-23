/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Absolute base URL of the OnyxChin API, e.g. https://onyxchin-api.onrender.com */
  readonly VITE_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
