# OPC Office

OPC Office is a live 3D dashboard for an AI team. Agents appear at desks on their department floors. The dashboard shows their status, current step, recent activity and reported usage.

## Open the dashboard

The office opens from your private link only. That link is the site root, then `#`, then your channel topic — the `LINK` line from [PROMPT.md](PROMPT.md). It works like a password: anyone who has it can read and post to the channel, so do not share it.

[OPC Office](https://mr-kafkabysea.github.io/OPC-Office/) without that `#` suffix stays locked. It does not show the office or a team. Names, looks, teams and chat links arrive on the channel; they are not stored in this repository.

A browser that has opened your link before can remember the channel. It puts the same `#` topic back in the address bar, so the private link is still the way in. An old `/office/#…` link redirects to the root and keeps the channel and any settings.

The dashboard reads ntfy and the [Cloudflare relay](relay/README.md).

## Development

The front end uses Three.js. Build the GitHub Pages files with Node.js 24:

```sh
node scripts/build-pages.mjs _site
```

Use an empty output directory. The Pages workflow builds and deploys the site on pushes to `main`.

`?demo=1` shows bundled sample data when you are developing the page locally. The public site does not open that sample office on its own.

For a local dashboard that reads a JSONL journal, see the [server guide](README-server.md). The [event contract](docs/CONTRACT.md) and [avatar guide](docs/AVATARS.md) describe the dashboard data.

## Credits

- Earth imagery from NASA Earth Observatory (Blue Marble and Black Marble), public domain.
- Furniture models from Kenney Furniture Kit, CC0.
