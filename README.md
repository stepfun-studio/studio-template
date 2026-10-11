# studio-template

Vendored static front-end templates for [StepFun Studio](https://github.com/stepfun-studio) workspace gallery and agent init flows.

## Layout

```
sites/<template-id>/   # static site root (index.html or equivalent)
```

Studio catalog markers use `repo=https://github.com/stepfun-studio/studio-template`, `ref=v1` (or `main`), and `dir=sites/<template-id>`.

## License

See [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md). Do not remove upstream `LICENSE` / `ATTRIBUTION.txt` files when refreshing vendors.

## Refresh vendors

```bash
./scripts/import-vendors.sh
```
