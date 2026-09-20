export {}

declare global {
  interface GoogleIdentityResponse {
    credential: string;
  }

  interface GoogleIdentityNotification {
    isNotDisplayed?: () => boolean;
  }

  interface Window {
    google?: {
      accounts?: {
        id?: {
          initialize: (options: { client_id: string; callback: (response: GoogleIdentityResponse) => void; ux_mode?: string; auto_select?: boolean }) => void;
          prompt: (callback?: (notification: GoogleIdentityNotification) => void) => void;
          renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}
