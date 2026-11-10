// Adds Sentry debug ids to bundles so crash stack traces map back to source.
const { getSentryExpoConfig } = require("@sentry/react-native/metro");

module.exports = getSentryExpoConfig(__dirname);
