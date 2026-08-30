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

## Signing in

| | Email | Password |
|---|---|---|
| Admin | `admin@demo.test` | `demo-admin` |
| Customer | `shopper@demo.test` | `demo-shopper` |

The sign-in page lists these too, because in a static build they are not
secrets — anyone can read them out of the JavaScript. They are safe for exactly
that reason: they exist only in `data.json`, the real API has never heard of
them, and every write is refused. The live admin address is not used and no
password hash is exported.

Change them by editing the `accounts` block in `export.js` and regenerating.

## What works, and what does not

**Works.** Browsing, search, filters, sorting, product pages, the cart and
coupon pricing. Signed in: order history, order detail, addresses, wishlist, and
the whole admin area — dashboard, products, orders, customers, coupons, reviews
and settings. Pricing and the dashboard totals are recomputed here from the same
rules the server uses, not copied from a canned response.

**Does not.** Anything that writes: checkout, editing a product, changing an
order's status, saving settings. Those answer 503 and the UI shows the message.
The cart is the one exception — it writes to `localStorage`, so it behaves
normally and is emptied by clearing site data rather than by an API call.

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
