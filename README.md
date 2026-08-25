# Linnmar Unknown — Easy Setup Guide

Linnmar Unknown is a Discord-style chat server that can run on a home Windows laptop. The laptop acts as the main server for chat, files, voice-room signaling, and the admin console. A separate Discord bot can optionally bridge messages with Discord.

> **Important:** This is a starter application, not a finished production security system. Before putting it on the public internet or using it with students/minors, finish the legal, privacy, security, and hosting review described below.

---

## 1. What you need

For the easiest Windows setup, you need:

- A Windows 10 or Windows 11 laptop/desktop.
- Node.js 24 or newer.
- An internet connection if you want people outside your home network to use it.
- A Discord account only if you want the optional Discord bot.

### Install Node.js

Download Node.js from the official site:

https://nodejs.org/

Install the current **LTS** release. After installation, open Command Prompt and check:

```text
node -v
npm -v
```

If both commands print version numbers, Node.js is ready.

---

## 2. Easiest way to start the server

### Option A — Double-click the launcher

1. Unzip this project somewhere on the laptop.
2. Open the `linnmar-unknown` folder.
3. Double-click:

```text
START-LINNMAR-UNKNOWN.bat
```

The launcher will install the Node packages if needed, create the local data folders, start the server, and open the site in your browser.

The normal local address is:

```text
http://localhost:3000
```

### Option B — Use Command Prompt

Open Command Prompt inside the project folder and run:

```bat
npm install
npm run setup
npm start
```

Then open:

```text
http://localhost:3000
```

---

## 3. First-time configuration

The project includes a `.env` file. Open it with Notepad.

At minimum, set a strong password for the built-in admin account:

```env
ADMIN_USERNAME=unknown
ADMIN_PASSWORD=PUT_A_LONG_RANDOM_PASSWORD_HERE
ADMIN_TAG=official
```

Do **not** publish or share the `.env` file. It can contain passwords, bot tokens, and other secrets.

The default settings are otherwise suitable for a basic local test:

```env
PORT=3000
PUBLIC_BASE_URL=http://localhost:3000
MAX_FILE_MB=50
TERMS_VERSION=1.0
```

The first time the server starts, it creates/uses local JSON data files under `data/` and uploaded files under `uploads/`.

---

## 4. Admin account

The built-in admin account is:

```text
Username: unknown
Tag: official
Password: the value you set in .env
```

There is also an `ADMIN-CREDENTIALS.txt` file included for the starter project. Treat that file like a password file and remove it or secure it before anyone else gets access to the project folder.

The admin console can be used for server management such as viewing statistics, managing bans, deleting messages, and checking server status.

---

## 5. What users see

The site is designed around chat first and includes:

- Discord-style channels and message history.
- Realtime messages.
- Online/presence indicators.
- Typing indicators.
- Replies.
- Reactions.
- Message editing and deletion.
- File sharing.
- Browser voice rooms using WebRTC signaling.
- Admin moderation tools.
- A required Terms/notice acceptance step.

The main interface is served from the `public/` folder.

---

## 6. Connecting from another device on the same Wi-Fi

The easiest way to test the server with a phone or another computer is to keep the server running on the laptop and open the laptop's local IP address from the other device.

### Find the laptop's local IP

On Windows:

1. Open Command Prompt.
2. Run:

```bat
ipconfig
```

3. Look for the IPv4 address of the active Wi-Fi/Ethernet adapter, often something like:

```text
192.168.1.25
```

Then open this on the other device:

```text
http://192.168.1.25:3000
```

### Windows Firewall

If another device cannot connect, Windows Firewall may be blocking port `3000`. Create an inbound TCP firewall rule for port 3000, or allow Node.js through Windows Firewall when prompted.

Only open the firewall port when you actually need LAN access.

---

## 7. Putting it on the public internet

Do **not** simply port-forward the Node.js development server to the entire internet and assume it is secure.

For public hosting, the recommended architecture is:

```text
Internet
   |
 HTTPS / domain
   |
 Reverse proxy (for example, Caddy or Nginx)
   |
 Linnmar Unknown Node.js server
   |
 data/ + uploads/
```

You should use:

- HTTPS with a real domain.
- A reverse proxy.
- Strong unique secrets.
- Regular backups.
- Firewall rules that expose only the ports you actually need.
- A persistent process/service manager rather than relying on a terminal window.
- A review of file-upload limits and content handling.
- Authentication hardening before public deployment.

### Voice chat warning

Browser microphone access and WebRTC work best over HTTPS. `localhost` is treated specially by browsers, but a real public deployment should use HTTPS.

For users behind restrictive networks, WebRTC may also require a TURN server for reliable connectivity.

---

## 8. Discord bot setup

The Discord bot is optional. The website/server works without it.

### A. Create the Discord application

Go to:

https://discord.com/developers/applications

Create a new application and add a Bot user.

### B. Get the bot token

Copy the bot token into `.env`:

```env
DISCORD_BOT_TOKEN=YOUR_BOT_TOKEN_HERE
```

**Never post the token publicly.** If the token is exposed, regenerate it in the Discord Developer Portal.

### C. Add the server/channel values

Set:

```env
DISCORD_GUILD_ID=YOUR_DISCORD_SERVER_ID
DISCORD_CHANNEL_ID=YOUR_DISCORD_CHANNEL_ID
DISCORD_BRIDGE_ENABLED=true
DISCORD_BRIDGE_SECRET=PUT_A_RANDOM_SECRET_HERE
```

### D. Enable the Discord intents the bot actually needs

Open the bot's settings in the Developer Portal and enable the privileged intents required by the features you use. Discord can change its requirements, so check the current Developer Portal documentation before a public deployment.

### E. Start the bot

Keep the main website server running, then open another Command Prompt in the project folder:

```bat
npm run bot
```

The starter bot includes basic commands such as `/ping` and `/status` and the bridge code can be extended for the exact Discord channel behavior you want.

---

## 9. Terms of Service

The project includes:

```text
TERMS-OF-SERVICE.md
public/terms.html
```

The login flow requires the user to actively accept the Terms before using the service. The server stores the Terms version and acceptance timestamp.

### Before public use

Replace the legal placeholders in `TERMS-OF-SERVICE.md` with the actual operator information, including the legal owner name, contact information, governing law, and dispute venue.

The Terms are not a substitute for a lawyer. No Terms document can guarantee maximum enforceability in every location. The final text should be reviewed for the actual operator, location, users, and intended deployment.

You also need to consider a separate Privacy Policy and any applicable child/student privacy obligations before allowing minors to use the service.

---

## 10. Backing up the server

For a simple backup, stop the server and copy these folders/files somewhere safe:

```text
data/
uploads/
.env
TERMS-OF-SERVICE.md
```

The `.env` contains secrets, so keep that backup private.

If you only need the user/message records and uploaded files, the important application data is primarily under:

```text
data/
uploads/
```

---

## 11. Stopping the server

### Easy way

Double-click:

```text
STOP-LINNMAR-UNKNOWN.bat
```

### Command-line way

In the terminal running the server, press:

```text
Ctrl+C
```

---

## 12. Restarting after changes

After changing `.env` or server files:

1. Stop the server.
2. Start it again with `START-LINNMAR-UNKNOWN.bat` or:

```bat
npm start
```

For development, this command automatically watches server files for changes:

```bat
npm run dev
```

---

## 13. Common problems

### `node` is not recognized

Node.js is not installed correctly or is not in your PATH. Reinstall the current Node.js LTS release and open a new Command Prompt.

### `npm install` fails

Check that you have internet access and are using a supported Node.js version. Then try:

```bat
npm install
```

again from the project folder.

### Port 3000 is already in use

Change the port in `.env`:

```env
PORT=3001
```

Then restart the server and open:

```text
http://localhost:3001
```

### Another computer cannot connect

Confirm the server works on the laptop first with `http://localhost:3000`, then check the laptop's LAN IP and Windows Firewall settings.

### File uploads fail

Check:

```env
MAX_FILE_MB=50
```

and make sure the `uploads/` folder exists and is writable.

### Voice chat does not work

Allow the browser to use the microphone. For public deployments, use HTTPS. Some networks also require a TURN server for reliable peer connections.

### Discord bot does not respond

Check the bot token, Discord server/channel IDs, bot permissions, gateway intents, and that `npm run bot` is actually running.

---

## 14. Project layout

```text
linnmar-unknown/
├─ bot/
│  └─ discord-bot.js       # Optional Discord bridge
├─ data/                    # Local JSON data
├─ uploads/                 # Uploaded files
├─ public/
│  ├─ index.html            # Main chat UI
│  ├─ app.js                # Client-side chat/voice logic
│  ├─ styles.css            # UI styling
│  └─ terms.html            # Terms page
├─ server.js                # Main Node.js server
├─ setup.js                 # First-run setup
├─ package.json             # Dependencies and scripts
├─ .env                     # Your local secrets/settings
├─ .env.example             # Safe configuration template
├─ TERMS-OF-SERVICE.md      # Terms of Service
├─ ADMIN-CREDENTIALS.txt    # Starter admin credential note
├─ START-LINNMAR-UNKNOWN.bat
└─ STOP-LINNMAR-UNKNOWN.bat
```

---

## 15. Recommended first setup checklist

- [ ] Install Node.js 24+.
- [ ] Unzip the project into a permanent folder.
- [ ] Open `START-LINNMAR-UNKNOWN.bat`.
- [ ] Set a strong `ADMIN_PASSWORD` in `.env`.
- [ ] Log in as `unknown` and test the admin console.
- [ ] Create a normal user and test chat.
- [ ] Test a file upload/download.
- [ ] Test a voice room with microphone permission.
- [ ] Test another device on the same Wi-Fi.
- [ ] Fill in the legal placeholders in the Terms before public use.
- [ ] Create a Privacy Policy appropriate for the actual service.
- [ ] Review security and child/student privacy requirements before inviting minors or exposing the service publicly.
- [ ] Set up backups.

---

## 16. Quick start in one screen

```bat
:: 1. Open Command Prompt in this folder
npm install

:: 2. Create the data folders and .env
npm run setup

:: 3. Edit .env and set ADMIN_PASSWORD

:: 4. Start the server
npm start

:: 5. Open in your browser
http://localhost:3000
```

Or on Windows, simply double-click:

```text
START-LINNMAR-UNKNOWN.bat
```

---

## 17. Important production note

This project is intentionally easy to run on a laptop, but a public chat platform needs more security and operational work than a local demo. In particular, consider stronger authentication, password hashing, rate limiting, CSRF/origin protections as appropriate, secure cookie/session design, content/file scanning, abuse reporting, audit logging, backups, HTTPS, a TURN server for voice reliability, and a formal privacy/data-retention policy before public deployment.

## Render hosting

For the prepared Render deployment, see **README-RENDER.md**. The repository includes a `render.yaml` Blueprint, PostgreSQL-backed app state support, and optional Supabase Storage for persistent uploads/profile images.

## One-click GitHub upload (Windows)

The easiest way to publish this project to a GitHub repository is to double-click **`UPLOAD-TO-GITHUB.bat`**.

The script will:

1. Check for Git and GitHub CLI.
2. Offer to install them with Windows `winget` if they are missing.
3. Open the GitHub sign-in flow if you are not already signed in.
4. Ask for a repository name (defaults to `linnmar-unknown`).
5. Ask whether the repository should be private or public (private is recommended).
6. Initialize Git, create the first commit, create the GitHub repository, and push the project.

### Important security behavior

The script uses the included `.gitignore`. It is designed **not to upload**:

- `.env` files and credentials
- `data/`
- `uploads/`
- `node_modules/`
- logs and other local runtime files

Keep the repository private while you are setting up the project, especially before adding any production configuration.

### What you need

You need a GitHub account and an internet connection. On Windows 10/11, the script can use `winget` to install Git and GitHub CLI automatically. If your PC does not have `winget`, install Git and GitHub CLI manually and then run the script again.

### After the upload

For Render, open Render and use **New → Blueprint**, then select the GitHub repository. Render will use the included `render.yaml` deployment configuration.

## GitHub Upload (visible window)

If `UPLOAD-TO-GITHUB.bat` closes too quickly, double-click `RUN-GITHUB-UPLOADER.bat` instead. It opens a normal Command Prompt and keeps it open so you can read and copy every message/error.

The detailed log is saved as `github-upload.log`.
