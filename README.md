# ZooHub

Visual social network for nature photographers, built with React, TypeScript, Express and PostgreSQL.

## Project structure

- `frontend/` contains the React/Vite application.
- `backend/` contains the Express API, database initialization and migrations.
- Root scripts orchestrate both sides so the project can still be started from `C:\ZooHub`.

## Features

- Accounts with user ID, display name, email, password and description.
- Sign in and sign out with per-tab browser sessions.
- Albums with title, description, one or more locations, and public/private visibility.
- Photos uploaded from the device as base64 or added by URL.
- Optional photo titles; untitled photos are numbered automatically.
- Specific location and country for every photo.
- Public album discovery with filters by title, photographer, ID or location.
- Photo deletion restricted to the album owner.

## Run locally

Requirements: Node.js 20+ and Docker Desktop.

```bash
npm install
npm run db:up
npm run server:dev
```

In another terminal:

```bash
npm run dev
```

The interface runs at `http://localhost:5173` and the API at `http://localhost:4000`.

## Main API

- `GET /api/health` checks the API and database connection.
- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout` and `GET /api/auth/me` manage authentication.
- `GET /api/users` and `POST /api/users` list and update profiles.
- `GET /api/users/:userId/albums` returns a user's collection.
- `GET /api/albums/explore` lists public albums.
- `POST /api/albums` creates an album.
- `PATCH /api/albums/:id/visibility` changes album visibility.
- `GET /api/albums/:id` returns an album and its photos.
- `POST /api/albums/:id/photos` adds a photo by URL or base64.
- `DELETE /api/albums/:albumId/photos/:photoId` deletes an owned photo.

The first run creates the tables and loads sample profiles, albums and photos. Data persists in the Docker volume `zoohub_postgres_data`.
