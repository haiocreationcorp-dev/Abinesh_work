# BharathComic

A browser-based comic strip creator — React + Vite frontend, Node.js + Express backend, PostgreSQL via Prisma ORM.

---

## Quick Start

### 1. Prerequisites
- Node.js 18+
- PostgreSQL (running locally via pgAdmin or psql)
- Git

### 2. Clone & Install

```bash
# From the project root
npm run install:all
```

This runs `npm install` in root, `/client`, and `/server`.

### 3. Configure the database

```bash
# Copy the example env file
copy server\.env.example server\.env
```

Edit `server/.env`:
```env
DATABASE_URL="postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/bharath_comic?schema=public"
JWT_SECRET=some-long-random-secret-string
```

Create the database in pgAdmin (name: `bharath_comic`), then:

```bash
# Run Prisma migrations
npm run db:migrate

# Seed the admin user (admin@bharathcomic.com / admin123)
cd server && node prisma/seed.js && cd ..
```

### 4. Run

```bash
npm run dev
```

- Frontend: http://localhost:5173
- Backend:  http://localhost:3000

---

## Admin Panel

Login as `admin@bharathcomic.com` / `admin123`, then visit `/admin` to upload assets.

---

## SVG Character Convention

For full skeletal body-part posing, export your character SVG with named `<g id="...">` groups:

| Group ID      | Body Part    |
|---------------|--------------|
| `head`        | Head         |
| `neck`        | Neck         |
| `torso`       | Torso / body |
| `left-arm`    | Left arm     |
| `right-arm`   | Right arm    |
| `left-hand`   | Left hand    |
| `right-hand`  | Right hand   |
| `left-leg`    | Left leg     |
| `right-leg`   | Right leg    |
| `left-foot`   | Left foot    |
| `right-foot`  | Right foot   |

Example SVG structure:
```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 200">
  <g id="head">   <!-- head circles, hair, etc. --> </g>
  <g id="torso">  <!-- body rectangle            --> </g>
  <g id="left-arm">  <!-- left arm path          --> </g>
  <!-- etc. -->
</svg>
```

---

## API Reference

| Method | Endpoint                     | Auth     | Description              |
|--------|------------------------------|----------|--------------------------|
| POST   | /api/auth/register           | —        | Register                 |
| POST   | /api/auth/login              | —        | Login → JWT              |
| GET    | /api/auth/me                 | User     | Current user             |
| GET    | /api/assets                  | User     | List assets (filterable) |
| GET    | /api/assets/:id              | User     | Single asset             |
| DELETE | /api/assets/:id              | Admin    | Delete asset             |
| POST   | /api/admin/assets/upload     | Admin    | Upload asset (multipart) |
| GET    | /api/admin/users             | Admin    | List users               |
| PATCH  | /api/admin/users/:id/role    | Admin    | Change user role         |
| GET    | /api/comics                  | User     | List my comics           |
| POST   | /api/comics                  | User     | Create comic             |
| GET    | /api/comics/:id              | User     | Get comic + panels       |
| PUT    | /api/comics/:id              | User     | Save comic + panels      |
| DELETE | /api/comics/:id              | User     | Delete comic             |

Static files: `GET /uploads/:category/:filename`

---

## Project Structure

```
BharathComic/
├── package.json            # root — concurrently
├── client/
│   ├── src/
│   │   ├── api/            # axios calls
│   │   ├── context/        # AuthContext, ComicContext (useReducer)
│   │   ├── components/
│   │   │   ├── admin/      # AssetUploadForm
│   │   │   ├── comic/      # ComicEditor, Panel, CharacterRig, SpeechBubble, Export
│   │   │   ├── library/    # AssetLibrary, AssetGrid, AssetCard
│   │   │   └── ui/         # Navbar, ProtectedRoute
│   │   └── pages/
└── server/
    ├── prisma/
    │   └── schema.prisma   # User, Asset, Comic, Panel models
    ├── uploads/            # local file storage by category
    └── src/
        ├── routes/         # auth, assets, comics, admin
        ├── controllers/
        ├── middleware/     # auth, adminAuth, errorHandler
        └── config/         # prisma client
```
