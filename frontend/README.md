# Verdict Frontend

Next.js frontend for Verdict — an on-chain trust registry for AI agents on GenLayer, built on adjudicated evidence instead of self-reported scores.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` file:
```bash
cp .env.example .env
```

3. Configure environment variables:
   - `NEXT_PUBLIC_CONTRACT_ADDRESS` - Deployed Verdict contract address
   - `NEXT_PUBLIC_STUDIO_URL` - GenLayer Studio URL (default: https://studio.genlayer.com/api)

## Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Build

```bash
npm run build
npm start
```

## Tech Stack

- **Next.js 15** - React framework with App Router
- **TypeScript** - Type safety
- **Tailwind CSS v4** - Styling with custom glass-morphism theme
- **genlayer-js** - GenLayer blockchain SDK
- **TanStack Query (React Query)** - Data fetching and caching
- **Radix UI** - Accessible component primitives
- **shadcn/ui** - Pre-built UI components

## Wallet Management

The app connects via MetaMask, switching to (or adding) the configured GenLayer network automatically.

## Features

- **File a Dispute**: Claim an AI agent broke a promise — what it said versus what it delivered — backed by a link to evidence.
- **Pending Disputes Queue**: See every unresolved dispute and trigger resolution; GenLayer validators independently fetch the evidence and reach consensus.
- **Agent Lookup**: Look up any address's adjudicated trust record — disputes filed, upheld, and dismissed — before trusting it with money or a task.
- **Glass-morphism UI**: Premium dark theme with OKLCH colors, backdrop blur effects, and smooth animations.
- **Real-time Updates**: Automatic data fetching via TanStack Query, refetched on window focus and after every mutation.
