const LEVELS = {
  PRODUCTION: 0,
  WARNING: 1,
  INFO: 2,
  VERBOSE: 3,
};

let configured = false;

function getDebugMode() {
  const value = String(process.env.DEBUG || (process.env.ENV === "prod" ? "PRODUCTION" : "INFO")).toUpperCase();
  return Object.prototype.hasOwnProperty.call(LEVELS, value) ? value : "INFO";
}

function configureConsole() {
  if (configured) return;
  configured = true;

  const mode = getDebugMode();
  const level = LEVELS[mode];
  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };

  console.log = (...args) => {
    if (level >= LEVELS.INFO) original.log(...args);
  };
  console.info = (...args) => {
    if (level >= LEVELS.INFO) original.info(...args);
  };
  console.debug = (...args) => {
    if (level >= LEVELS.VERBOSE) original.debug(...args);
  };
  console.warn = (...args) => {
    if (level >= LEVELS.WARNING) original.warn(...args);
  };
  console.error = (...args) => {
    original.error(...args);
  };
}

module.exports = {
  configureConsole,
  getDebugMode,
};
