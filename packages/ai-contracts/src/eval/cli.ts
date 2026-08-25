import { compareEvalReports, runOfflineEval } from './runner'
import { OFFLINE_EVAL_BASELINE_INPUT, runOfflineEvalBaseline } from './baseline'

function main() {
  const first = runOfflineEvalBaseline()
  const second = runOfflineEval(OFFLINE_EVAL_BASELINE_INPUT)
  const comparison = compareEvalReports(first, second)
  process.stdout.write(`${JSON.stringify({ first, second, comparison }, null, 2)}\n`)
  if (first.verdict !== 'pass' || !comparison.equal) {
    process.exitCode = 1
  }
}

main()
