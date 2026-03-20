# Email Finder Web App

Upload a CSV with `name` and `company` columns, provide a Reoon API key, and download a results CSV with verified emails.

## Local development

Run the app:

```bash
npm run dev
```

Health check:

```bash
curl http://localhost:3000/api/health
```

## CSV format

```csv
name,company
Jane Doe,Acme
John Smith,Globex
```

## Deploy to Vercel

The app needs no server env vars. Users provide their own Reoon API key in the UI.

```bash
vercel deploy --prod
```

## Routes

- `/`
- `/api/health`
- `/api/find-emails`

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
