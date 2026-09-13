import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  compareEvalReports,
  runOfflineEval,
  OFFLINE_EVAL_BASELINE_INPUT,
  runOfflineEvalBaseline,
  BUSINESS_ACCEPTANCE_BASELINE_INPUT,
  allBusinessAcceptanceMaterials,
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

const tamperedMaterials = allBusinessAcceptanceMaterials().map((item) =>
  item.id === 'material.explicit-total-price'
    ? { ...item, body: item.body.replaceAll('8800', '1') }
    : item,
)
const tamperedMaterialReport = runBusinessAcceptanceEval({
  ...BUSINESS_ACCEPTANCE_BASELINE_INPUT,
  materials: tamperedMaterials,
})
const tamperedWriteReport = runBusinessAcceptanceEval({
  ...BUSINESS_ACCEPTANCE_BASELINE_INPUT,
  observations: {
    ...BUSINESS_ACCEPTANCE_BASELINE_INPUT.observations,
    'hard.unreviewed-write': { hard: { blocked: false, wroteBusiness: true } },
  },
})

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
        tamperedMaterial: {
          verdict: tamperedMaterialReport.verdict,
          failures: tamperedMaterialReport.failures,
        },
        tamperedUnreviewedWrite: {
          verdict: tamperedWriteReport.verdict,
          failures: tamperedWriteReport.failures,
        },
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
  !businessComparison.equal ||
  tamperedMaterialReport.verdict !== 'fail' ||
  tamperedWriteReport.verdict !== 'fail'
) {
  process.exitCode = 1
}
