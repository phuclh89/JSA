# Coding rules

- Keep a modular monolith with Controller → Application Service → Domain → Repository Interface → Oracle Repository dependencies.
- Put SQL only in repository or infrastructure classes. Use bind variables for every value; never concatenate user input.
- Application services own transaction boundaries. Infrastructure helpers own connection cleanup, not domain decisions.
- Expose Oracle `NUMBER(19)` identifiers as JSON strings. Never use JavaScript `number` for them and never use `MAX(ID)+1`.
- Future tables use explicit Oracle sequences with site-specific, non-overlapping ranges. Replicated IDs are preserved; targets do not regenerate them.
- Do not hard-code workflows, risk matrices, or permission behavior outside the authorization framework.
- The frontend is not a security boundary. Backend guards enforce authorization and data scope.
- Every migration requires rollback. Never edit an applied migration; add a new migration.
- Implement only the active phase. Update `implementation-log.md`, `testing-log.md`, and `state.md` at each phase boundary.
