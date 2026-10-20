# Second Brain

Markdown notes and to-dos. The same SvelteKit app ships as a desktop app (Tauri) and a web app, synced in realtime through [PocketBase](https://pocketbase.io).

- **Desktop** keeps an Obsidian-style vault of `.md` files on disk (so Codex can edit them) and mirrors it to PocketBase both ways.
- **Web** reads and writes PocketBase directly. The Codex agent is desktop-only.

## Sync server

```sh
brew install pocketbase            # or download the binary from pocketbase.io
npm run build                      # web build, served by PocketBase from build/
npm run pb                         # http://127.0.0.1:8090, dashboard at /_/
```

The first run applies `pocketbase/pb_migrations` and prints a link to create the dashboard admin. Then add your account under **users** in the dashboard. Public sign-up is turned off.

To deploy, copy the `pocketbase` binary, `pocketbase/pb_migrations` and `build/` to a server and run the same `serve` command behind HTTPS (`pocketbase serve yourdomain.com` provisions a certificate).

## Desktop

Set `VITE_PB_URL` in `.env.local` (see `.env.example`) to your server, then `npm run tauri dev` or `npm run tauri build`. Without it, the desktop app runs local-only.

## Web dev

`npm run pb` in one terminal and `npm run dev` in another. `.env.local` points the dev server at PocketBase.
