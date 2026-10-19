# Release Notes

## Unreleased

- `runtests` now supports containers created with `--authenticationEmail` (AAD). Tests run through an internal, localhost-only NavUserPassword service tier (`FkhTest`) on the same database, which is created on the first run. Existing AAD containers need a restart to pick up the updated container scripts. See [AadAuthentication.md](AadAuthentication.md#running-tests).
