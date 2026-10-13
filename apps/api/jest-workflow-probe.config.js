const e2eConfig = require('./jest-e2e.config')

/** @type {import('jest').Config} */
module.exports = {
  ...e2eConfig,
  testRegex: 'workflow-consumer-probe.probe-spec.ts$',
}
