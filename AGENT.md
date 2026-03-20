# AGENT NOTES (internal)

## Project snapshot
- Name: `threejs-globe-landing`
- Type: Vite + Vanilla JS + Three.js landing page
- Purpose: Interactive 3D earth hero section (orbit controls, auto rotate, atmosphere, starfield)

## Runtime / tooling
- Node target: `24` (from `.nvmrc`)
- Package manager in repo: `npm` (README), lockfiles currently include both `package-lock.json` and `yarn.lock`
- Scripts:
  - `npm run dev`: start Vite dev server
  - `npm run build`: production build
  - `npm run preview`: preview built app

## Key files
- `src/main.js`:
  - Injects hero HTML + canvas into `#app`
  - Creates Three.js scene, camera, renderer, fog
  - Adds `OrbitControls` for drag/zoom
  - Creates procedural earth texture via canvas (`createEarthTexture`)
  - Builds earth mesh + atmosphere shader mesh + star points
  - Exposes runtime controls with `lil-gui` (`autoRotate`, `rotateSpeed`, `atmosphere`)
  - Runs animation loop + resize handler
- `src/style.css`:
  - Fullscreen canvas layout
  - Hero glass panel UI
  - Custom `lil-gui` theme
  - Mobile adjustments at `max-width: 768px`
- `index.html`: app mount + entry script
- `README.md`: usage docs in Vietnamese

## Current behavior
- Earth rotates automatically (toggleable by GUI)
- User can orbit/zoom (distance and polar angle constrained)
- Atmosphere glow can be toggled
- Starfield rotates slowly for depth feeling
- Responsive baseline already present for mobile

## Guardrails for future edits
- Keep rendering performant:
  - Clamp pixel ratio (`Math.min(window.devicePixelRatio, 2)`)
  - Avoid very high geometry segment counts unless needed
- Keep scene controls discoverable:
  - If removing `lil-gui`, replace with another debug/control mechanism
- Preserve mobile usability:
  - Re-check hero panel overlap and touch interactions on small screens
- If updating visuals:
  - Ensure color contrast still works against dark background
  - Keep `OrbitControls` limits sane for UX

## Suggested next improvements (optional)
- Add real earth textures/normal map (instead of procedural canvas texture)
- Add section scaffolding below hero (features, CTA, footer)
- Add simple loading state and FPS-safe degradation on low-end devices
- Add lint/format setup (`eslint`, `prettier`) for consistency
