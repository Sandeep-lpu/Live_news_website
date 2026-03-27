# PulseWire

PulseWire is a lightweight live news website starter with:

- a local Node server
- a real `/api/news` endpoint
- live top headlines from NewsAPI when a key is configured
- fallback demo stories when no live API key is present
- clear trust labels for trusted sources vs source-linked articles
- category filters, topic search, and manual refresh

## Quick start

1. Create a `.env` file from `.env.example`.
2. Add your NewsAPI key.
3. Run `npm start`.
4. Open `http://localhost:3000`.

## Environment variables

- `NEWS_API_KEY` - required for live headlines
- `NEWS_COUNTRY` - 2-letter country code for top headlines, defaults to `in`
- `NEWS_FALLBACK_COUNTRY` - backup country if the primary feed returns zero stories, defaults to `us`
- `PORT` - local server port, defaults to `3000`

## Scripts

- `npm start` - start the local server
- `npm run dev` - start the local server in watch mode

## Deploy on Vercel

1. Push the project to GitHub.
2. Import the repository into Vercel.
3. Add these environment variables in Vercel Project Settings:
   - `NEWS_API_KEY`
   - `NEWS_COUNTRY`
   - `NEWS_FALLBACK_COUNTRY`
4. Redeploy after saving the variables.

The homepage is served as static files and the live feed runs from the Vercel function at `/api/news`.

## Notes

- The frontend never exposes your API key because requests go through the local server.
- If the API key is missing or the live provider fails, the app serves a demo fallback feed instead of a blank screen.
- The trust badge is intentionally conservative. It only marks known allowlisted domains as `Trusted source`.
