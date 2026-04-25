function createLogger(serviceName) {
  return function log(level, message, fields = {}) {
    console.log(
      JSON.stringify({
        level,
        message,
        service: serviceName,
        time: new Date().toISOString(),
        ...fields,
      }),
    );
  };
}

module.exports = { createLogger };
