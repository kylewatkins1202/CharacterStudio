# Character Studio

An AI image generation tool with a cross-platform setup: an Electron desktop app and a React Native mobile companion app. Uses the [WaveSpeed](https://wavespeed.ai) API for image generation and an optional local [ComfyUI](https://github.com/comfyanonymous/ComfyUI) backend.

---

## Features

- **Generate images** from text prompts with tag-based prompt compilation
- **Reference images** — attach assets or photos to influence generation style and content
- **Gallery** — browse, hide, upscale, and download past generations
- **Assets** — upload and organize reference images into folders
- **Tags** — build reusable character/prop/outfit/location prompt fragments
- **Upscale** — upscale generated images via WaveSpeed
- **Local generation** — route generation through a local ComfyUI instance
- **Mobile companion** — iOS/Android app with live generation updates via WebSocket and push notifications

---

## Project Structure

```
ImageGeneraterAPI/
├── server/               Express API server
│   ├── routes/           API route handlers
│   │   ├── assets.js     Asset CRUD + folder management
│   │   ├── gallery.js    Gallery listing + entry management
│   │   ├── generate.js   Image generation pipeline
│   │   ├── tags.js       Tag CRUD
│   │   ├── compile.js    Prompt compilation endpoint
│   │   ├── events.js     Server-Sent Events (desktop live updates)
│   │   ├── settings.js   User settings + cache management
│   │   ├── models.js     Available model listing
│   │   └── comfyui.js    ComfyUI local generation
│   ├── utils/            Shared server utilities
│   └── db/               JSON file database
├── shared/               Code shared between desktop and mobile
│   ├── stores/           react-diffuse state stores
│   │   ├── GenerateStore.js
│   │   ├── GalleryStore.js
│   │   └── AssetStore.js
│   └── lib/              Shared utilities (api, theme, constants)
├── app/                  Electron + React desktop frontend (Vite)
├── app-mobile/           Expo React Native mobile app
├── server.js             Server entry point
└── main.js               Electron main process
```

---

## Setup

### Prerequisites

- Node.js 18+
- A [WaveSpeed API key](https://wavespeed.ai)

### 1. Install dependencies

```bash
# Root (server + Electron)
npm install

# Desktop frontend
cd app && npm install && cd ..

# Mobile (optional)
cd app-mobile && npm install && cd ..
```

### 2. Configure environment

Create a `.env` file at the project root:

```env
WAVESPEED_API_KEY=your_key_here

# Optional: enable local ComfyUI generation
LOCAL_GENERATION=true

# Optional: override default port (default: 4989)
PORT=4989
```

The API key can also be set at runtime through the Settings modal in the app.

### 3. Run in development

```bash
# Starts the Express server, Vite dev server, and Electron window together
npm run dev
```

Or start each piece separately:

```bash
npm run dev:server    # Express API on :4989
npm run dev:client    # Vite frontend on :5173
npm run dev:electron  # Electron window (after Vite is ready)
```

### 4. Build for distribution

```bash
npm run build
```

Outputs a platform-specific installer to `dist/`.

---

## Mobile App (Expo)

The mobile app connects to the same Express server over your local network.

```bash
cd app-mobile
npx expo start
```

On first launch, enter the server's local IP address (e.g. `http://192.168.1.10:4989`) in the connection screen. The app syncs generation updates in real time via WebSocket and fires a local push notification when a generation completes.

---

## API Overview

All endpoints are prefixed with `/api`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/generate` | Start an image generation |
| `GET` | `/gallery` | List gallery entries (paginated) |
| `DELETE` | `/gallery/:id` | Delete a gallery entry |
| `GET` | `/assets` | List assets (filter by folder, hidden) |
| `POST` | `/assets` | Upload images as assets |
| `POST` | `/assets/move` | Move assets to a folder |
| `GET` | `/assets/folders` | List folders |
| `POST` | `/assets/folders` | Create a folder |
| `DELETE` | `/assets/folders/:name` | Delete an empty folder |
| `PATCH` | `/assets/:id` | Update asset (hidden, purpose) |
| `DELETE` | `/assets/:id` | Delete an asset |
| `GET` | `/tags` | List tags |
| `POST` | `/tags` | Create a tag |
| `PUT` | `/tags/:key` | Update a tag |
| `DELETE` | `/tags/:key` | Delete a tag |
| `POST` | `/compile` | Compile tags into a final prompt |
| `GET` | `/settings` | Get settings |
| `PUT` | `/settings` | Save settings |
| `GET` | `/events` | SSE stream for live gallery updates (desktop) |
| `WS` | `/api/ws` | WebSocket stream for live updates (mobile) |

---

## Local Generation (ComfyUI)

To use a local ComfyUI instance instead of the WaveSpeed API:

1. Install and start ComfyUI on your machine
2. Set `LOCAL_GENERATION=true` in `.env`
3. In the app, switch the generation mode to **Local**

The server communicates with ComfyUI via its WebSocket API at `localhost:8188`.
