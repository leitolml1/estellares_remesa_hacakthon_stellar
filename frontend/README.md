# Remesa Directa — frontend

React + Vite + Tailwind. Habla con el backend Django de este repo
(`backend_django`) y firma con Freighter. La private key nunca sale de la
wallet.

El backend NestJS (`backend/`) ya no se usa.

## Cómo correrlo

1. Levantá Django (`cd backend_django` y el `runserver` en `:8000`).
2. En otra terminal:

```bash
cd frontend
npm install
npm run dev
```

Abrí http://localhost:5173 con Freighter instalado y una cuenta testnet
fondeada (Friendbot).

Vite proxea `/api` a `http://127.0.0.1:8000`. Si el API está en otro
origen, definí `VITE_API_URL` (Django tiene que aceptar CORS).

## Qué está cableado

- Enviar: el frontend arma el XDR → Freighter → submit a Horizon. Django
  solo guarda nota/categoría (`POST /api/payments/`).
- Recibir: balances desde Horizon + QR SEP-7.
- Historial: `GET /api/payments/history/<public_key>/`
- Pools: `POST /api/pools/`, `GET /api/pools/<short_code>/`
- Familia: `POST /api/family-pools/build-create-account/` → Freighter →
  `build-configure-signers/` (firma con la key efímera) → `confirm/`.
  Depósitos, retiros y Blend contra los endpoints de Django.
