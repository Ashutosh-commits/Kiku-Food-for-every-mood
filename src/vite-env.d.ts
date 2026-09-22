/// <reference types="vite/client" />

interface ImportMetaEnv {
<<<<<<< HEAD
  readonly DEV: boolean;
  readonly PROD: boolean;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
=======
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  readonly VITE_RECIPES_API_URL?: string;
>>>>>>> ed1a51580aecb4ac5c7cc1166ba8a01e928604dc
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
