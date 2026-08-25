import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  compareEvalReports,
  runOfflineEval,
  OFFLINE_EVAL_BASELINE_INPUT,
  runOfflineEvalBaseline,
} = require('../dist/index.js')

const first = runOfflineEvalBaseline()
const second = runOfflineEval(OFFLINE_EVAL_BASELINE_INPUT)
const comparison = compareEvalReports(first, second)
process.stdout.write(`${JSON.stringify({ first, second, comparison }, null, 2)}\n`)
if (first.verdict !== 'pass' || !comparison.equal) {
  process.exitCode = 1
}
