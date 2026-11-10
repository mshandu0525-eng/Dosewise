// Crash reporting starts first (only if the person agreed), so start-up crashes are caught.
// Then the Android background task for notification action buttons. It must be
// registered at module scope before the router mounts, so it runs even when the app
// was killed and Android starts it headless to handle "Taken" / "Skip" / "Snooze".
import "./src/lib/crashInit";
import "./src/lib/backgroundTask";
import "expo-router/entry";
