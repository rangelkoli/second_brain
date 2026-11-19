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

## Trainer

**Trainer** in the sidebar (`/learn`) teaches a topic with Gemini (`gemini-4-hydrogen`) using evidence-based study methods: short chunks, a retrieval question after each one, spaced and interleaved quizzing, and a Feynman check. Alongside **Notes** and the **Whiteboard**, a narrated **Lab** tab renders interactive step-by-step visuals across 7 modes (Web Audio piano/drums, geometry diagrams, algorithm steppers, projectile physics, pronunciation cards, annotated Wikimedia photos, and sandboxed HTML/SVG sketches) with inline quick checks. `/learn` also includes **Skill Trees** (built-in and AI-generated paths) and background session generation. The trainer sees your notes, active lab, and whiteboard on every turn; **Review my notes & whiteboard** asks for specific feedback, and **Schedule reviews** adds review to-dos 1, 3, 7 and 21 days out.

Replies are kept short (about 60 words) and in plain language. **Voice on** reads each reply aloud (`gemini-3.8-flash-tts`), **Listen** replays one, and the mic button lets you answer out loud (`gemini-3.5-transcribe`): tap it, talk, tap **Done**. The desktop app asks for microphone access the first time.

Set `GEMINI_API_KEY` (from [AI Studio](https://aistudio.google.com/apikey)) in the PocketBase server's environment; `scripts/dev.sh` loads it from `.env.local`. The trainer calls Gemini through the server hook `pocketbase/pb_hooks/gemini.pb.js`, so you must be signed in to the sync server and the key never reaches the browser. Session notes are normal synced notes; lesson transcripts and whiteboards stay in the browser.
