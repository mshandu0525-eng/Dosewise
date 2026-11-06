/** Tester mode exists only in development and internal "preview" builds, never in store builds. */
export const TESTER_BUILD = __DEV__ || process.env.EXPO_PUBLIC_TESTER_MODE === "1";
