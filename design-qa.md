# 新建发团页面 Design QA

- source visual truth path: `/var/folders/bl/f3j25y8d4jz3yldslb4vyfkw0000gn/T/codex-clipboard-0c05f9ee-3c16-4be5-b69d-fd0a69a3e48e.png`
- implementation screenshot path: `.codex/product-design-qa/new-departure-step1-complete.jpg`
- step 2 implementation screenshot path: `.codex/product-design-qa/new-departure-step2-complete.jpg`
- comparison evidence: `.codex/product-design-qa/step1-comparison-small.jpg`
- viewport: 1440 × 1024, light theme, desktop
- state: Step 1 selected route; Step 2 manually entered route with generated departure fields

## Findings

No actionable P0/P1/P2 visual mismatch remains.

- Typography: system UI font, 14px enterprise density, title weights and secondary copy hierarchy match the repository design contract and the reference.
- Spacing and layout: the vertical step rail, split working area, two-column route grid, selected-route strip, and persistent footer follow the reference proportions. The larger empty area with two real routes is data-driven and acceptable.
- Colors and tokens: selection, focus, borders, fills, and primary action use Ant Design theme tokens. No parallel palette, gradient, or decorative shadow system was introduced.
- Image and asset fidelity: the reference contains no raster content requiring generated assets. All icons use the existing Ant Design icon library.
- Copy and content: existing business labels and behavior are preserved. The reference-only refresh action and invented route metadata were intentionally not added because the current product API and original flow do not expose those capabilities.
- Step 2: the selected reference only specifies Step 1. Step 2 carries the same rail, density, form alignment, summary surface, and footer language without inventing new business behavior.
- Accessibility: route mode is a radio group; selection includes a labeled checkbox; destructive controls retain explicit accessible names; primary and secondary actions remain keyboard-addressable.

## Full-view comparison evidence

The combined reference/implementation image confirms the same major composition: existing application shell, compact page header, left progress rail, mode switch, full-width search, two-column route choices, selected result strip, and one primary footer action.

## Focused region comparison evidence

No additional focused crop was needed. At 1440 × 1024 the route cards, selection state, metadata, labels, and footer controls are readable in the full-view evidence. Step 2 was separately captured at the same viewport because it has no direct visual frame in the selected source.

## Comparison history

1. Initial browser capture exposed stale Ant Design deprecation logs and a disconnected `Form` warning.
2. Replaced deprecated Steps, Space, Select, and Spin props and connected the form during Step 1.
3. Fresh browser run completed route selection, manual-input navigation, and Step 2 rendering with zero console errors.
4. Final screenshots were captured at 1440 × 1024 and rechecked against the source.

## Implementation checklist

- [x] Route selection and manual-input modes work.
- [x] Selected route state and clear action work.
- [x] Step transition and generated values work.
- [x] Back action, validation, and create action remain wired.
- [x] Responsive rail and form grids collapse at tablet/mobile breakpoints.
- [x] Typecheck, full test suite, production build, and Ant Design lint pass.

## Follow-up polish

- P3: When the route library grows, pagination or virtualized loading can be added based on actual scale; it is not needed for the current two-route dataset.

final result: passed
