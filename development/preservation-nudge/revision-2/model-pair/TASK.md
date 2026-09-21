Use classes instead of attributes for scoping
Classes are always faster than attributes. We should consider using them:

```html
<!-- this... -->
<div class='svelte-xyz123'>...</div>
<div class='svelte-xyz123 foo'>...</div>

<!-- ...instead of this: -->
<div svelte-xyz123>...</div>
<div svelte-xyz123 class='foo'>...</div>
```

It will complicate `<div class='{{whatever}}'>` slightly, because we'd now need to include the scoping string in the `className` that it gets updated with.
Use classes instead of attributes for scoping
Classes are always faster than attributes. We should consider using them:

```html
<!-- this... -->
<div class='svelte-xyz123'>...</div>
<div class='svelte-xyz123 foo'>...</div>

<!-- ...instead of this: -->
<div svelte-xyz123>...</div>
<div svelte-xyz123 class='foo'>...</div>
```

It will complicate `<div class='{{whatever}}'>` slightly, because we'd now need to include the scoping string in the `className` that it gets updated with.


Environment (identical for P/H0/H1):
External network is unavailable to tools. Project dependencies are prepared. The project uses Node 16.20.2 and npm 8.19.4. Use the original package.json scripts and public project tests/docs. Diagnostic tooling is separate from the project toolchain.
For the project shell, the prepared startup is `. /usr/local/nvm/nvm.sh && nvm use 16.20.2`.
