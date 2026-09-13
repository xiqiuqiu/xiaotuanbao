import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  compareEvalReports,
  runOfflineEval,
  OFFLINE_EVAL_BASELINE_INPUT,
  runOfflineEvalBaseline,
  BUSINESS_ACCEPTANCE_BASELINE_INPUT,
  compareBusinessAcceptanceReports,
  runBusinessAcceptanceEval,
  runBusinessAcceptanceEvalBaseline,
} = require('../dist/index.js')

const first = runOfflineEvalBaseline()
const second = runOfflineEval(OFFLINE_EVAL_BASELINE_INPUT)
const comparison = compareEvalReports(first, second)
const businessFirst = runBusinessAcceptanceEvalBaseline()
const businessSecond = runBusinessAcceptanceEval(BUSINESS_ACCEPTANCE_BASELINE_INPUT)
const businessComparison = compareBusinessAcceptanceReports(businessFirst, businessSecond)
process.stdout.write(
  `${JSON.stringify(
    {
      first,
      second,
      comparison,
      businessAcceptance: {
        first: businessFirst,
        second: businessSecond,
        comparison: businessComparison,
      },
    },
    null,
    2,
  )}\n`,
)
if (
  first.verdict !== 'pass' ||
  !comparison.equal ||
  businessFirst.verdict !== 'pass' ||
  !businessComparison.equal
) {
  process.exitCode = 1
}
