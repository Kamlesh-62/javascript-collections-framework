---
"javascript-collections-framework": patch
---

The ES module build is published as one file per module. Bundlers that keep every class of a file they import, such as esbuild, now leave out the files of collections that are not imported, instead of bundling the whole package. The CommonJS, script-tag and type declaration files are unchanged. Only the package root is public; the files under `dist/` are internal and may change in any release.
