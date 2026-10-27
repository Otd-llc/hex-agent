# Known limitations

## Of the result
- **Fit, not strength.** `validate()` checks placement rules and the mesh
  collision gate. Nothing here rates load, vibration, moisture, UV life or
  real print fit.
- **No new CAD.** The print pack is the existing published parts for the
  build. The agent does not generate geometry or drawings.
- **Requirements are model-claimed.** Whether a build meets the brief is the
  model's own statement in `finish`, recorded as such. The configurator
  checks are independent; the brief match is not yet checked in code.
- `OPEN_CAP_FACE` (info) and `LOOSE_BODY` (warning) do not fail a run; only
  error-severity issues do.

## Of the platform (as observed 2026-10-27)
- The API is experimental v1 and may change.
- The live page is the deployed configurator; the seam-mesh STL re-export
  (hex-cluster #16) ships with the next release cut and is not in the
  current pack (release 2026-10-14).

## Of this build
- The live Meta model run has not happened yet: no API key in this
  environment. Only the scripted mock run has passed end to end.
- One visible Chrome window per run; no web UI beyond it and the printed log.
- Pricing constants are copied from Meta's page on 2026-10-27.
