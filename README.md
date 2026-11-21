# React Body Shape

A measurement-driven 3D body component for React. Bring your own measurements and interface, or use the optional editor.

**React 19 · TypeScript · Three.js · MIT code / CC0 assets · no remote model assets**

> **Preview:** `0.1.0-rc.2`. Anatomical male/female human meshes based on MakeHuman's CC0 assets, with authored body-shape morphs and measurement fitting. This replaces the earlier primitive-based model. The result is still an approximate visualization, not a body scan or validated reconstruction.

## Local demo

```sh
mise install          # or use Node 22.14+
npm ci
npm run dev          # http://127.0.0.1:5173
```

The demo includes both adult templates, live inputs, metric/imperial conversion, camera presets, measurement guides, surface colors, JSON export and a live component example. Measurements are held in memory, not uploaded or persisted. The demo loads optional Google Fonts; the library makes no network requests.

## Install

Once the first GitHub release has successfully published:

```sh
# Release candidates
npm install @dantehemerson/react-body-shape@next three

# Stable releases (after a stable version has been published)
npm install @dantehemerson/react-body-shape three
```

React and React DOM 19 are peer dependencies. Three.js is also a peer dependency so the consumer owns the renderer version. Use Three.js 0.170+ (tested with 0.181).

Before npm publication, build and install the local tarball:

```sh
npm run build:lib
npm pack --ignore-scripts
# In ../dash (or another app):
npm install ../body-shape/dantehemerson-react-body-shape-0.1.0-rc.2.tgz three
```

## React usage

```tsx
import { BodyVisualizer } from '@dantehemerson/react-body-shape';
import '@dantehemerson/react-body-shape/styles.css';

export function MyBody() {
  return (
    <BodyVisualizer
      template="male"
      units="metric"
      measurements={{
        height: 180,
        weight: 82,
        chest: 104,
        waist: 86,
        hips: 100,
        upperArm: 35,
        thigh: 59,
      }}
      showMeasurements
      style={{ height: 640 }}
    />
  );
}
```

The component is controlled: updating `measurements` updates the mesh. No account, API key, backend, Tailwind, external model download or global stylesheet reset is required. Import the optional scoped stylesheet above, or supply your own `.bs-*` styles. Give the viewer a height (the supplied stylesheet defaults to 32rem).

### Astro / `../dash`

Your dashboard uses Astro with React 19. Import the component in an `.astro` page and render it as a client-only React island:

```astro
---
import { BodyVisualizer } from '@dantehemerson/react-body-shape';
import '@dantehemerson/react-body-shape/styles.css';
const measurements = { height: 180, weight: 82, waist: 86 };
---

<BodyVisualizer
  client:only="react"
  template="male"
  measurements={measurements}
  showMeasurements
  style={{ height: 640 }}
/>
```

For live state, place the viewer and your inputs in one React island. An SSR-safe shell is also available for React SSR applications: the Canvas is only imported/mounted after hydration.

### Optional editor

```tsx
import { useState } from 'react';
import {
  BodyVisualizer,
  MeasurementEditor,
  type BodyMeasurements,
} from '@dantehemerson/react-body-shape';
import '@dantehemerson/react-body-shape/styles.css';

export function BodyStudio() {
  const [measurements, setMeasurements] = useState<BodyMeasurements>({
    height: 180,
    weight: 82,
  });

  return (
    <div>
      <MeasurementEditor
        value={measurements}
        onChange={setMeasurements}
        template="male"
        units="metric"
      />
      <BodyVisualizer measurements={measurements} style={{ height: 640 }} />
    </div>
  );
}
```

The editor does not insert estimates into your state. Editing an optional field makes it explicit; “Use estimate” removes that override. Number inputs commit on blur/Enter; sliders commit immediately. Invalid values retain the last valid model and show an associated error. Instances have independent accessible input IDs.

## Measurements

Only **height and weight are required**. Missing fields are estimated from height, weight and the selected adult template. Explicit measurements override those defaults, so changing weight never silently changes an entered waist or chest.

All lengths use **cm** in `metric` or **inches** in `imperial`, including height. Weight uses **kg** or **lb** respectively. A circumference is not a width.

| Input | Meaning |
|---|---|
| `height` | Standing height, floor to crown |
| `weight` | Body weight; influences unspecified defaults |
| `chest` | Full chest/bust circumference |
| `waist` | Natural waist circumference |
| `hips` | Full hips and seat circumference |
| `shoulderWidth` | Straight-line outer shoulder width |
| `neck` | Base-of-neck circumference |
| `upperArm`, `forearm`, `wrist` | Limb circumferences |
| `thigh`, `calf`, `ankle` | Leg circumferences |
| `inseam` | Barefoot floor-to-crotch length |
| `torsoLength` | Vertical crotch-to-shoulder distance in this model |
| `armLength` | Shoulder-to-wrist length, excluding the hand |
| `headHeight` | Chin-to-crown length |

Supported input ranges are exported as `measurementDefinitions`. These are software limits, not medical reference ranges. Additional proportion checks require inseam to be 33–57% of height and inseam + torso length to be 70–87% of height. The library models symmetric adult bodies, not children, pregnancy, asymmetry or individual posture.

### Unit conversion and inferred values

Changing `units` reinterprets your input; it does **not** convert state for you. Use the helper for a unit switch without losing precision:

```ts
import {
  convertMeasurements,
  resolveMeasurements,
} from '@dantehemerson/react-body-shape/core';

const imperial = convertMeasurements(
  { height: 180, weight: 82, waist: 86 },
  'metric',
  'imperial',
);

const { measurements, estimatedKeys, bmi } =
  resolveMeasurements(imperial, 'male', 'imperial');
// Resolved measurements are always cm/kg; estimatedKeys identifies inferred fields.
```

`resolveMeasurements` throws descriptive `RangeError`s for non-finite, out-of-range or inconsistent values. The viewer catches invalid input, displays an error and invokes `onError` if provided. Optional fields should be omitted, not set to `0`.

## Viewer props

| Prop | Default | Description |
|---|---|---|
| `measurements` | required | Controlled `BodyMeasurements` |
| `template` | `"male"` | `"male"` or `"female"` adult frame |
| `units` | `"metric"` | `"metric"` or `"imperial"` |
| `muscle` | `0.35` | Visual definition, 0–1; **not** muscle mass |
| `color` | `"#c2c5c1"` | Surface color |
| `background` | `"#f0f0e9"` | CSS background |
| `measurementColor` | `"#47765f"` | Guide color |
| `showMeasurements` | `false` | Chest, waist and hip guides + legend |
| `showControls` | `true` | Front / side / back / reset buttons |
| `showGrid` | `true` | Ground reference grid |
| `autoRotate` | `false` | Slow rotation; respects reduced-motion preference |
| `initialView` | `"front"` | `"front"`, `"side"`, `"back"`, `"perspective"` |
| `quality` | `"medium"` | `"low"`, `"medium"`, `"high"` mesh resolution |
| `className`, `style` | — | Container styling |
| `aria-label` | descriptive default | Accessible viewer name |
| `fallback` | explanatory message | WebGL/render error fallback |
| `onError` | — | Receives validation/render errors |

Pointer: drag to orbit and scroll/pinch to zoom. Keyboard: focus the model, then use left/right arrows, `+`/`-`, or `Home`. A textual measurement list remains accessible, including inferred-value labels. WebGL 2 is required for 3D.

## Geometry and accuracy

The bundled mesh and shape-target **assets** come from MakeHuman Community under **CC0 1.0**, pinned to a specific revision with an asset hash inventory. Its application code is not incorporated. The package's decoder, fitting logic, Catmull–Clark subdivision, React components and rendering are independently implemented, MIT-licensed code. See [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) and [`licenses/MakeHuman-CC0-1.0.md`](licenses/MakeHuman-CC0-1.0.md).

The body uses an authored anatomical control mesh with a face, eyes, ears, hands, fingers, feet, and toes—not blended mathematical shapes. Adult frame and muscle/weight morphs are blended, then fitting logic calibrates authored measurement targets against connected mesh cross sections. Catmull–Clark subdivision preserves the anatomical topology while smoothing the surface.

Guide rings follow the actual generated surface contours, not independent ellipses. Circumference targets are approximate: neighboring morphs, subdivision and proportion adjustments interact. Extrapolation is limited to protect anatomy at extreme or inconsistent measurement combinations. `getBodyGeometryMetadata(geometry)` exposes actual guide circumferences, requested targets and any fitting limits.

**Do not use it to fit garments to exact dimensions, infer body fat, diagnose health, or predict weight-loss appearance.** Shape fitting is not a validated reconstruction of a specific person.

Mesh changes are debounced by 120ms; rendering is on-demand unless auto-rotation is enabled. Low quality uses the control mesh; medium applies one subdivision level (~54k vertices); high applies two levels. Topology plans are cached. Use low/medium on smaller devices. Auto-rotation pauses when the tab is hidden or the viewer is skipped off-screen, and respects reduced motion. `muscle` blends authored whole-body shapes; it does not solve body composition from weight.

The model is bundled into the package; no model server, CDN, asset URL configuration, or external download is needed at runtime. To regenerate the pinned asset data and provenance manifest:

```sh
npm run assets:prepare
```

Advanced consumers can import `createBodyGeometry`, `getBodyLandmarks`, and `getBodyGeometryMetadata` from `/core`. World coordinates are meters, Y is up and +Z is forward. The caller must dispose geometries it creates.

## Releasing

**Publication is triggered only by publishing a GitHub Release**, using `.github/workflows/release.yml`. Draft releases, pushes and pull requests never publish to npm.

| GitHub release tag | GitHub prerelease? | npm dist-tag |
|---|---|---|
| `v0.1.0-rc.1` | Yes | `next` |
| `v0.1.0-rc.2` | Yes | `next` |
| `v0.1.0` | No | `latest` |

The workflow validates that the tag equals `v` + `package.json` version and that the GitHub prerelease flag matches the version. It then typechecks, tests, builds, packs, installs the actual artifact into a clean consumer, tests SSR/core/CSS exports, and publishes with provenance. Releases are serialized. Stable/RC mismatches are rejected before publication.

### One-time npm setup

1. Ensure you own the npm scope `@dantehemerson` (or change the package name and corresponding references before publishing).
2. For the first release of a new package, create a short-lived granular npm write token with the required scope/organization access and publishing/2FA permissions. Add it to the GitHub repository as **`NPM_TOKEN`** through GitHub's secret UI; never commit it.
3. Publish the first GitHub prerelease. The workflow creates the public package under `next`.
4. In the npm package settings, add a GitHub Actions **Trusted Publisher**:
   - Organization/user: `dantehemerson`
   - Repository: `body-shape`
   - Workflow filename: `release.yml`
   - Environment: leave empty
   - **Allow direct `npm publish`** (stage-only permission is insufficient).
5. Remove the bootstrap `NPM_TOKEN` secret and revoke the bootstrap token. Future releases use GitHub OIDC, without a long-lived npm token. Complete the first OIDC publication within npm's configuration-expiry window.

If npm supports registering a trusted publisher for your package before the first publication, you can configure it directly and skip the bootstrap token. See the current [npm trusted-publishing instructions](https://docs.npmjs.com/trusted-publishers).

### Publish a candidate

```sh
npm version 0.1.0-rc.2 --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release 0.1.0-rc.2"
git push origin main
gh release create v0.1.0-rc.2 --target main --prerelease --generate-notes
```

### Publish stable

```sh
npm version 0.1.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release 0.1.0"
git push origin main
gh release create v0.1.0 --target main --generate-notes
```

Promotion is a new stable version; an already published RC is immutable. To retry a transient failed workflow, rerun it in GitHub Actions. Do not reuse a version that npm has already accepted.

## Development checks

```sh
npm run check
npm pack --ignore-scripts
node scripts/smoke-package.mjs dantehemerson-react-body-shape-0.1.0-rc.2.tgz
npm audit
```

Tests cover unit conversion, measurement inference/overrides, validation, both template meshes, finite normals, measurement-driven geometry changes, scale, and release-channel safety.

Inspired by the interactions in [Body Tracker](https://www.bodytrackerapp.com/tools/3d-body-visualizer) and [AmosMind](https://amosmind.com/tools/body-visualizer). Not affiliated with either product.
