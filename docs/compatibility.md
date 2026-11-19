# Compatibility

The package is plain ES2015 JavaScript with TypeScript declarations and no dependencies. It
does not use any platform API (`process`, `window`, `node:*`), so the same code runs on servers,
in browsers, on edge runtimes and in React Native.

## Support matrix

| Tier             | Environments                                                                                                                                                                                                                            | How it is checked                                                                                                                                                                                                                          |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Tested**       | Node.js 22, 24, 26 (Linux) · Node.js 24 (Windows)                                                                                                                                                                                       | Full test suite on every change                                                                                                                                                                                                            |
| **Type-checked** | TypeScript 5.0 and later (checked on 5.0, 5.4, 5.9, 6.0 and 7.0)                                                                                                                                                                        | On every change, a program that uses every export compiles against the built declarations with `strict` and `skipLibCheck: false`, under `moduleResolution` `bundler`, `node16` (as ESM and as CommonJS) and, below TypeScript 6, `node10` |
| **Loaded**       | Node.js 18 and 20 (end-of-life) · Bun · Deno 2                                                                                                                                                                                          | The built package is loaded through `import` and `require` on every change                                                                                                                                                                 |
| **Targeted**     | Current Chrome, Firefox and Safari, and browsers back to Chrome 51, Firefox 45, Safari 10 · React Native (Hermes) · Cloudflare Workers, Vercel Edge and other edge runtimes · Electron · web workers · TypeScript 4.7–4.9 (best effort) | Every built file is verified to be ES2015 and free of platform APIs; dedicated tests for these environments are added before `1.0.0`                                                                                                       |
| **Unsupported**  | ES5-only engines (Internet Explorer 11, very old smart TVs) · AMD/UMD loaders · TypeScript before 4.7                                                                                                                                   | Transpiling the package with Babel and core-js may work but is not tested                                                                                                                                                                  |

What each kind of test covers, and what is not tested, is in [how this library is tested](testing.md).

## Ways to load it

<!-- example: not run — loads the package in other module systems -->
```js
// ES modules: Node.js, Deno, Bun, Vite, webpack, esbuild, Rollup, Parcel, Next.js
import {/* … */} from 'javascript-collections-framework'

// CommonJS: older Node.js, Jest
const {/* … */} = require('javascript-collections-framework')
```

```html
<!-- Script tag: exposes a global `JCF`. Pin an exact version and add the published integrity hash. -->
<script src="https://cdn.jsdelivr.net/npm/javascript-collections-framework@VERSION/dist/index.iife.js"
        integrity="sha384-…" crossorigin="anonymous"></script>
```

<!-- example: not run — loads the package in Deno -->
```ts
// Deno
import {/* … */} from 'npm:javascript-collections-framework'
```

On Node.js 20.19+ and 22.12+, `import` and `require` load the **same** copy of the package, so
classes and `instanceof` checks agree across both module systems.

## Using collections with UI frameworks

Collections are mutable objects. Frameworks that detect changes by reference (React, Angular
signals, Solid, Svelte) do not see an in-place `add`: replace the collection with a copy, or
signal the change explicitly. In Vue, hold a collection in `shallowRef` and call `triggerRef`
after changing it. A guide with recipes for React, Next.js, Vue, Svelte, Angular, Solid, MobX,
Redux and Immer is added with the first released collection.
