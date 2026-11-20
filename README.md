# Out to Sea

A break and breathing app. Every so often it asks you to look into the distance, out over a painted sea whose sky
follows the real time of day and your local weather, and then to breathe with it for a minute. It lives in the Mac menu
bar and runs in any browser at [sea.cwdx.md](https://sea.cwdx.md).

Made by [Chris Wijnia](https://chriswijnia.com). How and why it was built: [the note](https://chriswijnia.com/notes/out-to-sea).

## Install on a Mac

Download the latest `.dmg` from [Releases](https://github.com/cwdx/out-to-sea/releases) and drag Out to Sea to
Applications. It runs on Apple silicon.

The app is not signed with an Apple developer certificate yet, so macOS blocks it on first launch and may call it
damaged. Clear the download flag once, then open it as usual:

```sh
xattr -dr com.apple.quarantine /Applications/OutToSea.app
```

## Build it

```sh
bun install
cd packages/out-to-sea
bun run dev:views   # the web app on a local server
bun run app         # the Mac app, into build/
bun run sea out 1512 982   # every sky rendered to one sheet, with GPU timings
```

The sea, clouds, rain and snow are WebGPU shaders written with [vgpu](https://github.com/vercel-labs/vgpu); the Mac app
is [Electrobun](https://electrobun.dev); weather comes from [Open-Meteo](https://open-meteo.com) under CC BY 4.0.

## Licence

MIT, © Chris Wijnia. Keep the copyright notice and licence with any copy or fork, as the licence asks.

This repository is a mirror: it is copied from the author's monorepo on every change there, so pull requests are read
but applied upstream. A release is built here whenever the app's version changes.
