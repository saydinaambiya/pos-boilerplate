# ADR-0034: "Other" motif and colour

- Status: Accepted
- Date: 2026-09-30
- Requirements: PRD FR-PRD-06, FR-VAR-01/03, NFR-SEC-04; BRD Q-40
- Amends: [ADR-0026](./0026-listed-motifs-colours-and-defects.md) (listed values only)

## Context

Motifs and colours come from fixed lists in code, so a new one had to wait
for a release. Users asked for an "Other" choice with a text box for
anything missing from the lists, still guarded against injected content.

## Decision

- **"Other" in the dropdown.** `FormCombobox` takes an `other` option. It
  adds "Lainnya" at the end of the list, which stays visible whatever is
  searched. Picking it shows a text box that posts under the field's name
  in place of the list's hidden input. A stored value outside the list,
  including one from before ADR-0026, opens as "Other" with the text box
  prefilled.
- **Validation.** Typed names use `nameText`: `plainText` normalisation,
  then a letter or digit first and only letters, digits, spaces and
  `.,'&()/-` after, up to 60 characters for a motif and 40 for a colour.
  That keeps markup, quotes and leading `= + - @` (spreadsheet formulas in
  exports) out, on top of React escaping and parameterised queries.
- **Listed spelling wins.** A typed name that matches a listed one without
  regard to case is stored in the listed spelling (`navy` becomes `Navy`),
  so it gets the swatch and the unique colour check still applies.
- **No swatch for typed colours.** Hex values stay filled in, never typed
  (FR-VAR-03); a typed colour shows the neutral swatch.

## Consequences

- Typed motifs and colours are not added to the lists; a value that
  becomes common can be listed in a release.
- A legacy value with characters outside the allowed set must be retyped
  the next time that product or colour is saved.
