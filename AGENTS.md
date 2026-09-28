<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Startup Radar — Project Instructions

## Product

Startup Radar is a personalized startup event discovery platform for founders in South Korea.

Users create a profile with their startup information and interests. The application collects startup-related events, evaluates their relevance using Jev through OpenRouter, and displays personalized results.

## Technology

* Next.js App Router
* TypeScript
* Tailwind CSS
* shadcn/ui
* Supabase PostgreSQL
* Jev as the relevance evaluation provider, accessed through OpenRouter

## Architecture

Keep the application modular.

Separate:

* UI components
* Application logic
* Event source adapters
* Jev integration
* Database access
* API routes
* Shared types and validation

Keep Jev-specific code inside a dedicated provider module.

Do not couple the frontend directly to Jev.

## Jev Integration

Do not invent Jev endpoints, SDK methods, authentication mechanisms, or typed-question syntax.

Use the official Jev documentation to verify implementation details.

If the real integration is not configured, use a clearly identified mock provider.

Keep the mock provider interchangeable with the real provider.

Never expose secret API credentials in client-side code.

## Event Data

Normalize all event sources into a shared event schema.

Preserve original event URLs and source information.

Do not fabricate missing event dates, deadlines, organizers, or descriptions.

Handle duplicate events and incomplete listings gracefully.

Clearly distinguish mock events from verified event listings.

## Relevance Scoring

Evaluate events against the user's selected interests and configured preferences.

Keep the scoring weights configurable.

Do not claim that application-defined weights are prescribed by Jev.

Show understandable explanations alongside relevance scores.

## User Experience

Build a polished, responsive B2B SaaS interface.

Include loading, error, empty, and success states.

Make the refresh workflow clear to the user.

Use reusable components and consistent spacing, typography, and colors.

Avoid unnecessary complexity.

## Development Rules

* Use TypeScript types instead of unnecessary `any`.
* Validate external data and user inputs.
* Keep secrets in environment variables.
* Do not commit secrets.
* Prefer small, focused changes.
* Run linting and relevant checks after significant changes.
* Do not silently replace real integrations with mocks.
* Clearly communicate what is implemented, mocked, or incomplete.
* Do not introduce new dependencies without a clear reason.
