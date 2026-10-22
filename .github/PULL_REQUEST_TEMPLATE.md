## What and why

<!-- What does this change, and why is it needed? Link the issue if there is one. -->

## Checklist

- [ ] `npx tsc --noEmit`, `npm run lint` and `npm run test:unit` pass
- [ ] `npm run build && npm run test:e2e` pass (if the change touches HTTP behaviour)
- [ ] New or changed behaviour has a test (a bug fix has one that fails without it)
- [ ] New route handlers call `guardRequest()` (or the PR explains why not)
- [ ] No tokens or secrets are logged, returned to the browser or committed
- [ ] README or docs updated if behaviour changed
