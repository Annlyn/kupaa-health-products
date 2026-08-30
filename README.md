# Kupaa Health Products

Full-stack storefront: React + Vite client, Express + Prisma API, Razorpay
payments, Shiprocket shipping.

```
client/   React SPA (shop + admin)   -> GitHub Pages
server/   Express API + Prisma        -> Render
demo/     throwaway catalogue snapshot, deletable (demo/README.md)
```

## Local development

```bash
npm run setup   # install, create .env files, create and seed the SQLite database
npm run dev     # API on :4000, client on :5173 (proxied, so a single origin)
```

SQLite is the local default and Postgres is used in production. The Prisma
`provider` is rewritten from `DATABASE_URL` by `scripts/set-db-provider.js`,
which runs before every `generate`/`push`, so the same commit works in both
places and `schema.prisma` never needs hand-editing.

## Deploying

### 1. API (Render)

**New → Blueprint → this repository.** [render.yaml](render.yaml) provisions the
web service, a Postgres database and a 1 GB disk mounted at `/var/data`, with
`UPLOAD_DIR` pointed at it.

The disk is not optional: product images are written to the filesystem
(`src/middleware/upload.js`), and on Render's ephemeral storage every deploy
would delete the entire catalogue's imagery. That is also why the service runs
on `starter` rather than `free` — Render does not offer disks on free instances.

Fill in the values Render marks as required: `CLIENT_URL`
(`https://annlyn.github.io`, comma-separated for more than one origin),
`SERVER_URL` (the service's own URL), and the Razorpay/Shiprocket keys if you
are using them.

> Render's free Postgres is **deleted 30 days after creation**. Neon and
> Supabase both offer free Postgres with no such limit; to use one, delete the
> `databases:` block in render.yaml, set `DATABASE_URL` to `sync: false`, and
> paste their connection string into the dashboard. No code changes either way.

### 2. Client (GitHub Pages)

Set the repository variable `VITE_API_URL` to the API's origin under
**Settings → Secrets and variables → Actions → Variables**, e.g.
`https://kupaa-api.onrender.com`. Vite inlines it at build time, so the value
has to exist before the build, not after. Push to `main` and
[.github/workflows/deploy.yml](.github/workflows/deploy.yml) does the rest.

Until that variable is set, the workflow builds in **demo mode** instead: the
catalogue comes from the snapshot in [demo/](demo/README.md) and the site works
with no server behind it. Setting `VITE_API_URL` switches it off, and the demo
folder can then be deleted outright — nothing outside it refers to it, and the
build succeeds either way.

### 3. Move the catalogue across

A fresh deployment has an empty database. To carry the local one over —
products, images, orders, settings and your admin login:

```bash
npm run db:export -w server                       # dump the local SQLite database

DATABASE_URL="postgresql://…" npm run db:import -w server \
  -- --media https://kupaa-api.onrender.com       # load it, then upload the images
```

`--media` exists because image *files* live on the server's disk while the
database only stores their paths. It signs in as the admin, pushes each local
file through the same upload endpoint the admin UI uses, and rewrites the rows
to match. Seeded category artwork is SVG, which the uploader rejects on purpose,
so it is rasterised to PNG on the way (macOS only — elsewhere those categories
end up with no image and the tile renders plain).

Both halves are re-runnable. Rows are upserted by primary key; `--skip-rows`
re-runs only the media step, and omitting `--media` re-runs only the rows.
Running the full command again re-uploads every image and orphans the previous
copies on the disk.
