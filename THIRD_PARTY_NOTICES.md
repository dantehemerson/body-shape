# Third-party model assets

The anatomical human control mesh, eye helper surfaces, adult male/female shape
targets, muscle/weight targets and measurement targets are derived from
**MakeHuman Community** bundled assets, released under **CC0 1.0 Universal**.

- Upstream: https://github.com/makehumancommunity/makehuman
- Revision: `a8bc2d54ff0ac92e78ff71431b1023eda42bf482`
- License: [`licenses/MakeHuman-CC0-1.0.md`](licenses/MakeHuman-CC0-1.0.md)
- Asset inventory and SHA-256 hashes: `src/assets/human.provenance.json`
- Reproduction: `node scripts/prepare-human-assets.mjs`

MakeHuman separates its assets (CC0) from its application code (AGPL).
This package incorporates **asset data only**. Its decoder, measurement-fitting
logic, subdivision implementation, React components and rendering code are
independently implemented in this repository. No MakeHuman application code is
incorporated.

The assets' CC0 dedication does not grant rights to MakeHuman trademarks or imply
endorsement. The package's own code remains MIT licensed.
