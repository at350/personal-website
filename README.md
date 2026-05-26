# personal-website

Alan Tai's portfolio. React + Vite + Tailwind + GSAP.

## Develop
```bash
npm install
npm run dev
```

## Build
```bash
npm run build      # outputs dist/
```

## Deploy
Pushes to `main` deploy to GitHub Pages via `.github/workflows/deploy.yml`.
Enable Pages → Source: "GitHub Actions" in repo Settings once.

Current URL: https://at350.github.io/personal-website/

### Custom domain (later)
1. Rename `public/CNAME.example` → `public/CNAME`.
2. Set `VITE_BASE: "/"` in the workflow's build step env.
3. Point `alantai.org` DNS at GitHub Pages.

## Add project screenshots
Drop `architec.png`, `greenchain.png`, `prophis.png`, `legal-llm.png`
(~1600px, 16:10) into `public/projects/`. Cards use them automatically.
