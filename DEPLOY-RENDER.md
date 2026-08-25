# Deploy Linnmar Unknown to Render Free

1. Push this folder to a private GitHub repository.
2. **Do not upload `.env` or real credentials.** The included `.gitignore` blocks them.
3. In Render, choose **New → Blueprint** and select the repository.
4. Render reads `render.yaml` and creates a Free Node web service plus a Free Postgres database.
5. When Render asks for secret values, enter a new strong `ADMIN_PASSWORD` and leave Discord/Supabase values blank until you configure them.
6. Deploy and open the URL Render provides.
7. For persistent uploaded files/profile images, configure Supabase Storage using the steps in `README-RENDER.md`.

Render free Postgres is a temporary development datastore: current Render documentation says the free database has 1 GB storage and expires after 30 days. The web service filesystem is ephemeral, so uploaded files should not be stored only on the server filesystem.
