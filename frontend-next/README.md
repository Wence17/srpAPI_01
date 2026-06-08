# Sub2API Next.js Scaffold

This folder contains a Next.js + TypeScript + Tailwind scaffold for the Sub2API frontend.

## What is included

- Next.js app router structure
- all frontend routes mapped from the existing Vue router
- route metadata and path placeholders
- a shared page shell for consistent layout
- `/admin` redirect support
- dynamic pages for `/legal/[documentId]` and `/custom/[id]`

## How to run

```bash
cd frontend-next
npm install
npm run dev
```

## Notes

This scaffold preserves all frontend route paths and page metadata, but it currently contains placeholder pages for migration. The next step is to port each UI component and store implementation from the original Vue frontend into React.
