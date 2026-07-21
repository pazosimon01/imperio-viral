# Subir Imperio a la nube (24/7, sin depender de la Mac)

La app ya está lista para la nube: la base de datos (Supabase) y las imágenes ya
viven en internet, así que solo falta mover el "cerebro" (el servidor Next.js).
Este contenedor (Dockerfile) incluye **ffmpeg** y **curl**, que la app necesita.

## Plataforma recomendada: Railway (la más simple)

Railway se conecta a tu GitHub, construye el Dockerfile solo y te da una URL fija.
Costo: **~$5/mes** (uso real; arranca en $5).

### Pasos (una sola vez, ~15 min)

1. **Crear cuenta** en https://railway.app → "Login with GitHub" (usa la cuenta
   `pazosimon01`, la misma del repo).
2. **New Project → Deploy from GitHub repo → `pazosimon01/imperio-viral`.**
   Railway detecta el `Dockerfile` y empieza a construir.
3. **Variables → RAW Editor**: pega TODAS estas (los valores los copias de tu
   `.env` local — nombres exactos):

   ```
   DATABASE_URL
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   DEFAULT_WORKSPACE_ID
   ANTHROPIC_API_KEY
   OPENAI_API_KEY
   APIFY_TOKEN
   IG_PROXY_URL
   NOTION_TOKEN
   NOTION_DATABASE_ID
   SESSION_SECRET
   INVITE_CODE
   ```

4. **Settings → Networking → Generate Domain** → te da una URL tipo
   `imperio-viral-production.up.railway.app`.
5. **Redeploy** y espera a que termine el build (2-4 min).
6. Abre la URL → deberías ver el login de Imperio. ¡Listo, 24/7!

### En el iPhone
Reemplaza la URL de ngrok por la nueva de Railway (Compartir → Agregar a inicio).
Ya NO depende de tu Mac: funciona con la Mac apagada.

## Notas
- El `.env` NO se sube (está en `.dockerignore`) — los secretos van solo en el
  panel de Railway. Correcto y seguro.
- La Mac local puede seguir usándose para desarrollo; la nube es la de producción.
- Alternativas equivalentes: Render (Docker, $7/mes) o Fly.io (Docker, CLI).
