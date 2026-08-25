# Linnmar Unknown — Render Free Deployment

This project is prepared for Render's free web-service tier.

## What the Render version does

- Runs the Node.js/Express app on Render.
- Uses Render's `PORT` automatically and listens on `0.0.0.0`.
- Includes a `/healthz` health-check endpoint.
- Stores app state in PostgreSQL when `DATABASE_URL` is present.
- Falls back to local JSON files when you run the project on your laptop.
- Supports persistent file/profile storage through Supabase Storage when configured.
- Keeps Discord credentials in Render environment variables instead of source code.
- Includes `render.yaml` so Render can create the web service and database together.

## Important free-tier limits

Render's free web services can sleep after inactivity and their local filesystem is ephemeral. Do not depend on the Render server's `uploads/` directory for permanent files. Render's free Postgres is limited to 1 GB and expires after 30 days, with a grace period to upgrade. See the Render documentation before treating this as a production service.

For file persistence, this build supports Supabase Storage. Supabase's current Free plan includes 1 GB of storage and a 50 MB maximum file-size limit, so the default Linnmar file limit of 50 MB is intentional.

## Easiest deployment

### 1. Put the project on GitHub

Create a new GitHub repository and upload the contents of this folder. Do not upload your real `.env` file or real bot token.

The repository should contain:

```text
render.yaml
package.json
server.js
storage.js
public/
bot/
README.md
README-RENDER.md
TERMS-OF-SERVICE.md
```

### 2. Create the Render Blueprint

In Render, choose **New → Blueprint** and select your GitHub repository. Render detects `render.yaml` and can create the web service plus the Postgres database.

### 3. Fill in the secrets

Render will prompt for values marked `sync: false`.

Set at minimum:

```text
ADMIN_PASSWORD=use-a-long-random-password
```

Keep the password private. Never commit it to GitHub.

### 4. Deploy

Let Render build the service. The build command is:

```text
npm install
```

The start command is:

```text
npm start
```

Render supplies the `PORT` environment variable automatically.

### 5. Open the site

After the deploy finishes, Render gives the service an `onrender.com` URL. Open that URL in a browser. The app should load the Linnmar Unknown login page.

## File/profile storage with Supabase

Without external storage, files uploaded to the Render web service are temporary because Render's free web-service filesystem is not persistent.

To make file uploads and profile pictures persist:

1. Create a Supabase project on the Free plan.
2. Create a Storage bucket named `linnmar-files`.
3. Make that bucket public if you want the current app to serve direct public URLs.
4. In Render, add:

```text
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_ONLY_SERVICE_ROLE_KEY
SUPABASE_BUCKET=linnmar-files
```

**Never put the Supabase service-role key in browser JavaScript or GitHub.** It belongs only in Render's server-side environment variables.

The server will upload files to Supabase when those variables are present. When they are absent, local laptop development uses `uploads/` instead.

## Discord bot

The web app and Discord bot are separate processes. You can keep the bot on your laptop, run it on another host, or add it as a separate Render service later.

For the web service, set:

```text
DISCORD_BRIDGE_ENABLED=true
DISCORD_BRIDGE_SECRET=your-random-bridge-secret
DISCORD_BOT_TOKEN=your-bot-token
DISCORD_GUILD_ID=your-server-id
DISCORD_CHANNEL_ID=your-channel-id
```

Do not commit the bot token.

## Updating the site

Make a change locally, commit it to GitHub, and push it. Render can automatically redeploy the service from the repository.

## Local development still works

You can continue using:

```text
START-LINNMAR-UNKNOWN.bat
```

The local version does not require Render or a database. It uses the local `data/` directory. The same code detects `DATABASE_URL` automatically when deployed.

## If a Render deploy fails

Check the service's **Logs** page first.

Common causes:

### `DATABASE_URL` is missing

Make sure the Blueprint created the Postgres database and that the web service has `DATABASE_URL` connected through the `fromDatabase` entry in `render.yaml`.

### Uploads fail

Either configure the three Supabase variables or accept that uploads are temporary on Render's filesystem.

### The app opens but voice chat does not work

Voice chat uses browser WebRTC. Users may need HTTPS, microphone permission, and compatible network conditions. Render provides HTTPS for the public service.

### The site is slow when nobody has visited it

This is expected on Render's free web-service tier because inactive services can spin down and need to wake up when a new request arrives.

## Security checklist before public launch

- Change the admin password.
- Generate a long random Discord bridge secret.
- Never commit `.env` or bot tokens.
- Configure Supabase storage rather than depending on the Render filesystem.
- Review the Terms of Service and add the real legal owner/contact/jurisdiction information.
- Add rate limiting and stronger password hashing before treating this as a production service.
- Review privacy and children's-privacy requirements if minors will use the platform.
