# Demo catalogue

A snapshot of the store that lets the GitHub Pages build run with **no backend
at all** — useful while the API is not deployed yet, or for a link someone can
open without a server behind it.

```
adapter.js   answers API requests from the snapshot instead of the network
data.json    products, categories, coupons and store settings   (generated)
media/       product photos, downscaled                          (generated)
export.js    regenerates the two above from a real database
test.mjs     checks the adapter still behaves like the API
```

## What works, and what does not

Browsing, search, filters, sorting, product pages, the cart and coupon pricing
all work — the guest cart already lives in `localStorage`, and pricing is
recomputed here using the same rules as `server/src/services/pricing.service.js`.

Sign-in, checkout and admin do not, and cannot: they write data, and in demo
mode there is nowhere to write it. Those requests answer 401/503 with a message
saying so, and a banner at the top of every page says the same.

## Regenerating

```bash
npm run demo:data    # reads the database server/.env points at
npm run demo:test    # 17 checks against the new snapshot
```

The output is generated but **committed**, because the GitHub Actions runner has
no database to export from. Re-run both after changing products, categories,
coupons or store settings.

Photos are downscaled to 1200 px JPEG on the way out (via `sips`, so macOS
only), which keeps the whole folder at a few megabytes rather than tens.

## Deleting this folder

That is the whole removal process — no other file needs editing.

`client/vite.config.js` resolves the import `virtual:demo` to `adapter.js` when
this folder exists and to an inert stub when it does not, so with the folder
gone `DEMO` is a compile-time `false`, the snapshot-reading code is dropped by
tree-shaking, and the build still succeeds. Nothing under `client/` or
`server/` references this folder by path.

Once `VITE_API_URL` is set as a repository variable the demo is off anyway —
the deploy workflow only enables it when that variable is empty — so deleting
the folder is tidying up rather than a switch that has to be thrown.
