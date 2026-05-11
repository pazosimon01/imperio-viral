# CLAUDE.md

Notas operativas y lecciones del proyecto **Imperio Viral**. Léelas antes de
tocar el código — están aquí porque varios bugs sutiles costaron horas.

## Qué es este proyecto

App web para descubrir reels, fotos y carruseles virales de Instagram.
Multi-niche desde el día 1 (cualquier vertical, cualquier cliente). Pipeline:

1. **Scraper** (Node + TypeScript) → llama a Apify, normaliza, persiste en Postgres.
2. **App Next.js** → grid visual con filtros, decisiones rápidas, detalle interactivo.
3. **Multi-tenant**: workspaces (equipo / cliente) y **nichos** (separación temática
   dentro de un workspace — IA, Belleza, Cocina, etc.).

## Stack y por qué

- **Next.js 15** App Router (server components + URL params para filtros).
- **PostgreSQL** vía **Supabase** (managed, free tier alcanza para empezar).
  Conectado por el **Transaction pooler** porque la conexión directa de Supabase
  es IPv6-only y casi ninguna red residencial latinoamericana tiene IPv6.
- **`pg`** (node-postgres) con `Pool` para conexiones. Reemplazó `node:sqlite`
  cuando movimos a multi-tenant — escala a Pueblo + permite RLS.
- **`apify-client`** oficial.
- **`tsx`** para ejecutar scripts TypeScript directamente.
- **Tailwind 3** para estilos.

## Setup local (para nuevos instaladores)

```bash
# 1. Clonar e instalar
git clone <repo>
cd "Scraping IG"
npm install

# 2. Instalar la CLI de Supabase (Windows con Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
# (macOS: brew install supabase/tap/supabase)

# 3. Crear proyecto en https://supabase.com/dashboard/new
#    - Región: us-east-1 (Virginia) — más rápido desde Latam
#    - Plan Free está bien para empezar

# 4. Linkear y aplicar migrations
supabase login
supabase link --project-ref <tu-project-ref>
supabase db push       # aplica todo lo que esté en supabase/migrations/

# 5. Crear workspace + nicho inicial via SQL editor del dashboard:
#    INSERT INTO workspaces (name) VALUES ('Mi equipo') RETURNING id;
#    -- Anotá ese UUID. Luego:
#    INSERT INTO niches (workspace_id, name, slug)
#    VALUES ('<workspace-uuid>', 'General', 'general') RETURNING id;

# 6. Crear .env (ver .env.example):
#    APIFY_TOKEN=apify_api_...
#    OPENAI_API_KEY=sk-proj-...        (opcional, solo para transcripción)
#    ANTHROPIC_API_KEY=sk-ant-api03-... (opcional, solo para adaptación)
#    DATABASE_URL=postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres
#    DEFAULT_WORKSPACE_ID=<workspace-uuid del paso 5>

# 7. Correr
npm run build && npm start    # modo producción (rápido)
# o
npm run dev                    # modo dev con hot-reload (lento, 3-5× más lento)
```

⚠️ **El password del DATABASE_URL debe estar URL-encoded**: `*` → `%2A`, `@` → `%40`,
etc. Si tu password tiene caracteres especiales, la app falla con errores raros.

## Comandos

```bash
npm run dev                                          # hot-reload, lento
npm run build && npm start                           # prod, ~3-5× más rápido

# Scrapers
npm run scrape -- --hashtag=X --limit=N --type=both|posts|reels
npm run scrape:profile -- --user=X --limit=200       # incremental por defecto
npm run scrape:profile -- --user=X --full            # ignora cutoff de 1 año
npm run import-run -- --runId=X --user=Y             # importa un Apify run ya ejecutado

# Recomputes (correr tras cambiar fórmulas)
npm run recompute-scores                             # ER, view_rate, viral_score
npm run recompute-baselines                          # medianas + tiers
npm run recompute-hashtag-heat                       # heat relativo al hashtag
npm run refresh-language                             # reclasifica idioma

# Setup / debug
npm run init-db                                      # verifica conexión + conteos
npm run diagnose-scrape                              # últimos scrape runs
npm run diagnose-apify-run -- --runId=X              # detalle de un run
```

Scripts de diagnóstico legacy (`peek`, `dump-raw`, `analyze-er`, `diagnose-post`,
`test-img`, `inspect-actor`) están en `tsconfig.exclude` porque todavía usan el
viejo helper `getDb()` de SQLite. Migrarlos cuando se necesiten.

## Métricas de viralidad — lectura DETENIDA

### `engagement_rate` — ESTÁNDAR DE MERCADO (NO inventar fórmulas custom)

```
ER = (likes + comments) / followers × 100
```

**Misma fórmula para TODOS los tipos** (reels, fotos, carruseles). Es la que
usan Hootsuite, Sprout Social, HubSpot, HypeAuditor, Modash. Los benchmarks
publicados están calibrados para esta fórmula:

- `<1%` bajo · `1-3%` promedio · `3-6%` bueno · `6-9%` excelente · `9%+` outlier

**Si no conocemos `followers` del autor → ER queda null.** Por eso existe la
sección de enriquecimiento.

⚠️ **NO usar fórmula ponderada** `(likes + comments×4 + shares×6) / views` —
genera números 3-5× más altos que el estándar y rompe la comparación con
otras herramientas.

### `view_rate` — solo reels, métrica complementaria

```
view_rate = (likes + comments) / views × 100
```

Útil cuando `engagement_rate` no se puede calcular (autor sin enriquecer).
**Visible en el detalle del post pero NO es el ER principal.**

### `engagement_score` — score absoluto ponderado, ranking interno

```
engagement_score = likes + comments×4 + shares×6
```

Mantiene el peso del experto inicial. Lo usamos para ranking interno,
baselines de perfil y heat relativo al hashtag. **Nunca se muestra como
"engagement rate"**.

### `viral_velocity` y `viral_score`

- `viral_velocity = views / horas_desde_publicación` (o engagement_score/h
  para no-reels).
- `viral_score = log10(velocity + 1) × (1 + ER%/100)`. Funciona para todos
  los tipos. **Es el sort default recomendado.**

## Tiers visuales — DOS sistemas distintos, no confundir

### 1. Tier de perfil (basado en mediana del creador)

Solo aplica a posts de perfiles trackeados.
`viralidad_multiplier = post.engagement_score / profile.median_engagement_score`.

| Multiplier | Tier |
|---|---|
| 2-5× | 🟢 good |
| 5-10× | 🥉 viral |
| 10-25× | 🥈 gem |
| 25-50× | 🥇 diamond |
| 50×+ | 💎 unicorn |

### 2. Heat (basado en ER% absoluto, estándar mercado)

Aplica a cualquier post cuyo autor tenga followers conocidos.

| ER% | Heat |
|---|---|
| 1-3% | 🌿 fresco |
| 3-6% | 🔥 tibio |
| 6-9% | 🔥🔥 caliente |
| 9%+ | 🔥🔥🔥 explosivo (validar — puede ser bait) |

### 3. Hashtag heat (fallback para no-reels sin followers)

Para fotos/carruseles cuyo autor NO está enriquecido, el ER es null.
Calculamos `hashtag_heat_mult = post.engagement_score / median(engagement_score)`
de su misma `(hashtag, type)`. Tiers: 2-5× tibio · 5-10× caliente · 10×+ explosivo.

Ver `lib/hashtag-heat.ts`. Se recomputa automáticamente tras cada hashtag scrape.

## Inferencia de idioma — 4 categorías

`lib/language.ts` clasifica como `es`, `en`, `pt`, `other`, o `null`:

1. **Hashtag → idioma directo**: `aiads → en`, `trafegopago → pt`.
2. **Caption con script no latino** (Devanagari, árabe, CJK, cirílico,
   thai, hebreo) → `other` directamente.
3. **Heurística de caption** con stopwords distintivas para es/en/pt/fr.
   Si gana `fr` → `other`.

**Filtro UI "Solo ES/EN/PT"** filtra `language IN ('es','en','pt')` —
excluye `other` Y `null`.

⚠️ **No mapear a `null` para "no soportado"** — usar `other`. Reservar
`null` solo para "no se pudo clasificar".

## Multi-tenant: workspaces y nichos

### Modelo

```
workspaces (1 por equipo / cliente)
  └── niches (separación temática: IA, Belleza, Cocina, etc.)
        └── posts / profiles / scrape_runs / jobs
```

Cada row tiene `workspace_id` y `niche_id`. Filtrado por **ambos** en cada
query.

- `DEFAULT_WORKSPACE_ID` en `.env` indica el workspace activo (hasta que se
  monte auth, todo el tráfico va al mismo workspace).
- **Nicho activo** se guarda en cookie `active_niche=<slug>`. El dropdown del
  header lo cambia, `lib/niches.ts:getActiveNiche()` lo lee en cada page.

### Sobre el upsert de posts cruzando nichos

Si el mismo post de IG se scrapea en dos nichos diferentes, **el primer nicho
gana**. El `ON CONFLICT (workspace_id, id) DO UPDATE` actualiza métricas pero
NO toca `niche_id`. Esto evita que data de un nicho contamine a otro.

### Row Level Security (RLS)

Todas las tablas tienen RLS activado con políticas basadas en
`is_workspace_member(workspace_id)`. La función está marcada `SECURITY DEFINER`
+ `STABLE` para que la pueda llamar el planner sin recursión.

Hoy la app se conecta vía pooler con role `postgres` (bypassa RLS — accede a
todo). Cuando agreguemos Supabase Auth, las queries pasarán a `authenticated`
y RLS empezará a aplicar.

### Cookies y caching

Leer cookies en una page hace que Next.js la marque como **dynamic** — el
`revalidate=30` deja de aplicar. Esto fue un trade consciente al agregar
niches: perdemos ~300ms de cache para ganar segmentación. Si en el futuro
duele, usamos `unstable_cache` por nicho.

## Apify — gotchas críticas

### Actores que usamos

| Actor | Para qué | Cuesta |
|---|---|---:|
| `apify/instagram-hashtag-scraper` | Hashtag scrapes | $2.60/1k items |
| `apify/instagram-scraper` (posts) | Profile scrape (reels + carruseles) | $2.70/1k items |
| `apify/instagram-scraper` (details) | Enriquecimiento (solo metadata, 1 item/perfil) | $2.70/1k items |
| `apify/instagram-scraper` con `directUrls: [postUrl]` | Re-scrape de UN post | $2.70/1k (sale 1 item) |

Plan típico: **Apify Starter** ($29/mo, Bronze tier discount). Constants en
`lib/pricing.ts`.

### Inputs del hashtag-scraper

- `resultsType` por defecto es `"posts"` → devuelve solo Image + Sidecar,
  CERO reels. Para reels: `resultsType: "reels"`.
- **NO acepta `onlyPostsNewerThan`** — solo el profile-scraper.
- **Plan Starter mantiene la limitación de "primera página"** del feed del
  hashtag — solo se desbloquea con tiers más altos.

### Inputs del profile-scraper (`apify/instagram-scraper`)

- `directUrls` acepta URLs de perfil O URLs de post puntual.
- `resultsType: "posts"` (default — todos los tipos) o `"details"` (solo
  metadata, 1 item por perfil — para enriquecimiento).
- `onlyPostsNewerThan: "YYYY-MM-DD"` ← úsalo para incremental.
- `addParentData: true` para que cada item incluya `followersCount`, etc.

### Quirks de la respuesta

- **Reels devuelven `videoPlayCount` e `igPlayCount`** — NO `videoViewCount`.
  Fallback: `videoViewCount ?? videoPlayCount`. SQL: `COALESCE(...)`.
- **`likesCount: -1` significa "Instagram ocultó el contador"**. Tratar como
  0 en cálculos PERO mostrar como "ocultos" en UI. **No mostrar `❤️ -1`.**
- **Posts/carruseles recién publicados llegan con likes=0, comments=0**.
- **Bios de Instagram vienen TRUNCADAS** desde el API (terminan en "…").

### `resultsLimit` es máximo, NO garantía

Si pides 50 y el feed solo tiene 30, devuelve 30. Hashtags pequeños suelen
devolver 20-35. Hashtags grandes llegan a 50+.

### Apify NO permite "skip these IDs"

Cuando re-scrapeamos un hashtag, **pagamos por todo lo que devuelva incluso
si ya lo teníamos**. Mitigación: warning preventivo en `ScrapeHashtagForm`
que estima % de overlap según días desde el último scrape.

## Imágenes y videos — IG es hostil con embedders externos

### Image proxy (`/api/img`) — esencial

Las URLs del CDN de Instagram (`*.cdninstagram.com`, `*.fbcdn.net`) están
firmadas para el navegador del owner del post y devuelven 403 al pedirlas
desde otro browser por política de referer.

**Solución**: proxy server-side en `app/api/img/route.ts`. Recibe `?url=...`,
valida que el host sea de IG, descarga del lado servidor, retransmite con
cache-control 24h.

Helper: `imgProxy(url)` en `lib/img.ts`. **TODOS los `<img>` deben pasar
por ahí.**

### Videos: NO son reproducibles desde el browser, jamás

⚠️ **Lección dura**: las URLs de video que devuelve Apify están firmadas
con tokens ligados a la sesión/IP del scraper, no a un tiempo de expiración.
Devuelven 403 incluso recién scrapeadas, incluso desde nuestro server Node,
con cualquier User-Agent. La firma `oh=...` no funciona fuera del contexto
de Apify.

Un "re-scrape" del mismo post **no soluciona** — la URL nueva tampoco se
puede reproducir desde el browser del usuario.

**Solución única confiable**: iframe de Instagram embed (`https://www.instagram.com/p/<shortCode>/embed/`).
IG sirve el video desde sus propios servidores sin URLs firmadas.

Ver `components/MediaViewer.tsx`. Para reels SIEMPRE renderizamos el embed.
Algunos embeds requieren login (IG cada vez más bloquea contenido sin sesión)
— en ese caso el embed muestra solo el poster + link "Ver en Instagram".

**No prometerle al usuario que re-scrapeando se arregla un video roto.**

## Joyas ocultas y enriquecimiento

Caso de uso: detectar **cuentas pequeñas con reels viralizando** (views >> followers).
Para eso necesitamos `followersCount` del autor.

### Flow

1. Usuario scrapea hashtag → reels obtienen `view_rate` pero NO `engagement_rate`.
2. En `/hashtags`, sección **"Detectar joyas ocultas"** (`components/EnrichSection.tsx`):
   - Filtro por calor mínimo basado en `view_rate` (no en `engagement_rate`,
     porque es circular: para tener ER necesitamos followers, que es lo que
     vamos a obtener).
3. Click → llama a `apify/instagram-scraper` con `resultsType: "details"`.
4. Tras enriquecer: `recomputeScoresForOwners()` recalcula ER de TODOS los
   posts de esos autores.

### Bug histórico: stub para perfiles inaccesibles

Si Apify no devuelve data para un perfil (cuenta privada, banned, deleted),
**ANTES** lo descartábamos silenciosamente y los candidatos seguían apareciendo
para siempre. **Fix**: ahora creamos un "stub" en `profiles` con
`bio = "[no enriquecido — cuenta privada, eliminada o sin acceso]"`.

### Métrica derivada: views/followers

`viewsPerFollower = views / followers` se computa al query-time. En PostCard:
- 🚀 5×+ badge morado sólido = joya oculta clara
- 2-5× badge morado tenue
- <2× sin badge

## Ventanas temporales — DOS conceptos distintos

- **`baselineWindowDays`** (default 180) — solo posts de los últimos 180d
  entran al cálculo de mediana del perfil.
- **`activeWindowDays`** (default 365) — posts más viejos que un año se
  conservan en DB pero `viralidad_multiplier` y `viral_tier` quedan null.
- **Ventana de display** (UI) — lo que el usuario elige (7d/15d/30d/90d/180d/365d/all).

⚠️ **Bug histórico**: cuando el usuario pickaba "Todo el histórico",
`Number.isFinite(undefined) ? days : 90` silenciosamente caía a 90d. Separar
`undefined = sin filtro` de `valor inválido = fallback a 90`.

## Incremental scraping (solo perfiles)

`lib/scrape-actions.ts:scrapeProfile` es incremental:

1. Lee `profiles.scraped_at` antes del scrape.
2. Si existe → pasa `onlyPostsNewerThan = scraped_at - 1 día` a Apify.
3. Si NO existe → cutoff de 1 año.
4. Flag `--full` desactiva el cutoff.

Costo del 2º scrape: ~10× menor que el primero. **Hashtag scraper NO tiene
incremental** — re-scrapea siempre.

## Migraciones de schema (PG via Supabase)

Migrations viven en `supabase/migrations/<timestamp>_<name>.sql`.

```bash
supabase migration new <name>     # genera archivo vacío con timestamp
# edita el .sql
supabase db push                  # aplica a la DB remota
```

### Patrón para agregar columna NOT NULL a tabla existente

1. ADD COLUMN nullable.
2. Backfill con `UPDATE`.
3. `ALTER COLUMN ... SET NOT NULL`.

Todo en un `DO $$ ... END $$` block para que sea atómico. Ver
`20260511215605_niches.sql` como referencia.

### `supabase link` quirks

- La conexión "Direct" (`db.<ref>.supabase.co:5432`) es **IPv6-only**.
  Casi ninguna red residencial Latam tiene IPv6 → falla.
- Solución: re-correr `supabase link --project-ref X` pasando el password
  cuando lo pida. La CLI guarda la **Transaction pooler** URL que es IPv4.
- En la app usar SIEMPRE el pooler (`aws-1-<region>.pooler.supabase.com:6543`).

## Postgres + `pg` — gotchas

### Connection pool — CRÍTICO

```ts
new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 8,
  idleTimeoutMillis: 10_000,   // cerrar antes que Supavisor
  connectionTimeoutMillis: 10_000,
  keepAlive: true,              // TCP keepalive
  ssl: { rejectUnauthorized: false },
});

pool.on("error", (err) => {
  console.error("[pg pool error]", err.message);
});
```

⚠️ **Sin el `keepAlive` y el `pool.on("error")`**, después de unos minutos
empiezas a ver "Connection closed" porque Supavisor cierra conexiones idle
del lado servidor y el pool reusa zombies. Sin el error handler, el proceso
de Next CRASHEA en lugar de logear.

### Bigint sale como string por default

```ts
import { types } from "pg";
types.setTypeParser(20, (v) => parseInt(v, 10));  // 20 = OID de int8
```

Sin esto, `posted_at` y similares vuelven como string y rompen todas las
fechas, ordenamientos, etc.

### Pasar arrays y objetos a Postgres

- `text[]`: pasar JS array directo. node-pg lo serializa.
- `jsonb`: pasar JS object/array. node-pg llama `JSON.stringify`.
- ⚠️ **Si pasas un STRING a un campo jsonb**, node-pg lo envía como text y PG
  intenta parsearlo. Si el string no es JSON válido, falla.

### NEVER `SELECT p.*` cuando tabla tiene jsonb pesado

`raw_json` es ~10 KB por row. Un `SELECT p.* ... LIMIT 500` transfiere ~5 MB
por request. Listar columnas explícitas baja la latencia 5-15×.

### `node:sqlite` → `pg`: migración async cascade

Si vienes de `node:sqlite` sync: TODO se vuelve async. Esperá un cambio de
`function get(...)` → `async function get(...)` en cientos de lugares.

### Transacciones

`pg.Pool` no transacciones implícitas. Para BEGIN/COMMIT:

```ts
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>) {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const r = await fn(client);
    await client.query("COMMIT");
    return r;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
```

⚠️ **El pooler en modo "transaction" pool por-transacción** — multi-statement
transactions en una sola conexión sí funcionan pero son ineficientes. Para
operaciones largas (loops de UPDATEs), prepara una transaction explícita y
mantén un solo `client` durante todo el batch.

### `decisions` no tiene `niche_id` directo

Las decisiones se identifican por `(workspace_id, post_id)`. El post tiene
niche_id, así que las queries que cuentan decisiones por nicho deben hacer
JOIN con posts para filtrar. Ver `getGlobalStats`.

## Performance — qué movió la aguja

### Resumen de optimizaciones acumuladas

| Cambio | Mejora `/posts` |
|---|---:|
| Inicio (dev, SQLite local) | rápido pero single-user |
| Migración a PG remoto (us-west-2, sin optimizar) | 9.7s ⚠️ |
| Drop `raw_json` del SELECT | 4.5s |
| `next build && npm start` (prod mode) | 470ms |
| Cache `revalidate = 30` | 247ms |
| Migrar región a us-east-1 | DB query 2× más rápida (no se nota en page) |
| Paginación LIMIT 60 | 247ms se sostiene con renders ligeros |
| Niches (cookies → dynamic pages) | 552ms (perdimos cache) |

**~17× mejora total** vs. el peor caso.

### Cosas que NO movieron la aguja

- Tunear `max` del pool
- Optimizar índices individuales (PG ya los usa OK)
- Cambiar `LOWER()` por columnas pre-normalizadas (data ya está lowercase)

### Modo dev vs prod

Dev mode recompila cada ruta on-demand → 1-2s de overhead por request.
**Para uso real (incluido equipo navegando), correr `npm run build && npm start`**.

### Región: us-east-1 (Virginia) >> us-west-2 (Oregon) desde Latam

Desde Colombia: ~85ms RTT a Virginia vs ~150ms a Oregon. São Paulo es más
cerca geográficamente pero peor en práctica porque el tráfico latinoamericano
sale por Miami → costa este de USA.

### Paginación

`queryPosts` pide `LIMIT pageSize + 1` para detectar `hasMore` sin un COUNT
extra. Slice al final si trajo `pageSize + 1`. Page size: 60 (caben bien en
grid 5×12).

## Transcripciones (Fase 6)

On-demand desde el botón "Transcribir" en `/posts/[id]`. Solo para
`type === "Video"`.

### Modelo y costo

- **Modelo**: `gpt-4o-transcribe` (NO `whisper-1` — deprecated, WER peor).
- **Costo**: $0.006/min. Reel típico de 45s ≈ $0.005.
- **Límite**: 25 MB por archivo.

### Quirks de la API

- `gpt-4o-transcribe` **NO soporta `response_format=verbose_json`** — no
  obtenemos timestamps por palabra ni idioma detectado.
- Pasamos `language` (ISO 639-1) como hint.
- **URLs del CDN de IG caducan**. Transcribir un reel viejo casi nunca
  funciona porque la URL del video murió.

### Bias de vocabulario (`prompt` param)

Whisper confunde términos técnicos: `Claude → Cloud`, `GPT → JPT`,
`Sora → Sara`. El `prompt` (max ~224 tokens) actúa como bias acústico
sin inyectar texto. Ver `lib/transcription.ts:AI_GLOSSARY`.

## Adaptación al español + anatomía (Fase 6.1)

Sobre una transcripción existente, generamos: guión adaptado, anatomía
(hook + desarrollo + CTA), plantilla con `[PLACEHOLDERS]`, y 5 hooks
alternativos.

### Modelo

- **`claude-sonnet-4-6`** (Anthropic). Cambiado de `gpt-4o-mini` que hacía
  adaptaciones planas. Sonnet 4.6 es referencia para escritura creativa en
  español neutro Latam.
- **Costo**: ~$0.015 por reel.
- **JSON garantizado vía tool use**: definimos una tool `submit_adaptation`
  con `input_schema` estricto y `tool_choice: { type: "tool", name }`.

### Cuándo se ofrece el botón

Solo si `transcription.language !== "es"`. Si ya está en español, omitimos.

## Estructura del proyecto

```
.
├── .env / .env.example         # APIFY_TOKEN, OPENAI/ANTHROPIC, DATABASE_URL, DEFAULT_WORKSPACE_ID
├── supabase/
│   ├── config.toml
│   └── migrations/             # SQL versionado, aplicado con `supabase db push`
├── lib/
│   ├── apify.ts                # cliente, runHashtagScrape, runProfileScrape, runProfileDetailsScrape, runPostScrape
│   ├── baseline.ts             # recomputeProfileBaseline (mediana + 5 tiers)
│   ├── db.ts                   # pg pool, query(), queryOne(), withTransaction(), getWorkspaceId()
│   ├── niches.ts               # nicho activo desde cookie, listNiches, createNiche, getActiveNicheId
│   ├── enrichment.ts           # joyas ocultas
│   ├── hashtag-heat.ts         # heat relativo a la mediana del hashtag
│   ├── img.ts                  # imgProxy()
│   ├── apify-usage.ts          # consumo del plan
│   ├── jobs.ts                 # tracking de jobs async
│   ├── language.ts             # inferLanguage
│   ├── persist.ts              # normalize, upsertPosts, upsertProfile, recordScrapeRun
│   ├── pricing.ts              # APIFY_*_COST + estimateCost
│   ├── queries.ts              # PostFilters, queryPosts (paginated), getAllProfiles, getGlobalStats, ...
│   ├── score.ts                # computeScores
│   ├── scrape-actions.ts       # scrapeProfile, scrapeHashtag
│   ├── transcription.ts        # transcribePost (gpt-4o-transcribe)
│   ├── adaptation.ts           # adaptPost (claude-sonnet-4-6)
│   └── types.ts
├── components/
│   ├── ApifyUsageBadge.tsx
│   ├── NicheSelector.tsx       # dropdown header — switch / crear nichos
│   ├── Pagination.tsx          # ← Anterior / Siguiente → en grids
│   ├── MediaViewer.tsx         # SIEMPRE iframe IG embed para video
│   ├── PostCard.tsx            # tarjeta del grid
│   └── ...                     # FilterBar, DecisionButtons, TierBadge, etc.
├── app/
│   ├── layout.tsx              # header con NicheSelector (server, lee cookie)
│   ├── api/
│   │   ├── niches/             # listar / crear / set-active
│   │   ├── posts/[id]/refresh/ # re-scrape de un post (limitado: URLs siguen siendo session-locked)
│   │   ├── adapt, transcribe, decisions, enrich, hashtag/info, img, jobs, scrape
│   ├── posts/, hashtags/, profiles/, shortlist/, posts/[id]/
│   └── page.tsx                # dashboard
└── scripts/                    # tsx scripts: scrape, recompute, init-db, etc.
```

## Roadmap

| Fase | Estado | Qué |
|---|---|---|
| 1 | ✅ | Estructura, schema, tipos, scoring |
| 2 | ✅ | Scraper Apify (hashtag + profile) |
| 2.5 | ✅ | Inferencia de idioma (es/en/pt/other) |
| 2.6 | ✅ | Engagement rate estándar mercado |
| 2.7 | ✅ | Profile scraping + baseline + 5 tiers |
| 2.8 | ✅ | Filtro temporal + incremental |
| 3 | ✅ | App Next.js (grid + filtros + detalle) |
| 3.x | ✅ | Forms de scrape desde UI, heat para no-reels, enriquecimiento, paginación |
| 4 | ✅ | Migración SQLite → Postgres (Supabase) + multi-tenant (workspaces) |
| 4.1 | ✅ | Region us-east-1, prod build, cache 30s, perf optimizada |
| 4.2 | ✅ | Nichos (separación temática dentro del workspace) |
| 5 | ✅ | Embed de IG para videos (los signed URLs no son reproducibles desde browser) |
| 6.0 | ✅ | Transcripción on-demand con gpt-4o-transcribe |
| 6.1 | ✅ | Adaptación al español + anatomía con Claude Sonnet 4.6 |
| 7 | pending | Análisis visual con Gemini |
| 8 | pending | Generación de deliverables (hooks/scripts) con Haiku |
| 9 | pending | Supabase Auth + activar RLS (real multi-tenant) |
| 10 | pending | Deploy a Vercel / Netlify + worker para scrapes largos |

## Cosas que NO hacer

- **No inventar fórmulas de engagement custom**. Estándar de mercado.
- **No usar `better-sqlite3`** ni cualquier dep con `node-gyp` (Windows hostile).
- **No commitear `.env`** ni `data/`.
- **No asumir que `videoViewCount` viene poblado** — usar `COALESCE` con `videoPlayCount`.
- **No mostrar `❤️ -1`** — IG ocultó likes, mostrar "ocultos".
- **No dejar `ORDER BY` sin tiebreakers** cuando el campo principal puede ser NULL.
- **No mezclar `null` con "no soportado"** en clasificaciones — usar `other`.
- **No crear índices en `CREATE TABLE` para columnas que se añaden via migration** —
  van en el migration que las añade.
- **No filtrar candidatos para X por una métrica que requiere X** (lógica circular).
- **No cambiar fórmulas sin recalibrar umbrales** que dependan de ellas.
- **No usar `SELECT p.*` con tablas que tienen jsonb pesado**. Listar columnas.
- **No prometerle al usuario que re-scrapear arregla un video roto**. No funciona.
- **No commitear contraseñas en `CLAUDE.md`** ni en `README.md` (este archivo va a Git).
- **No omitir `keepAlive` y `pool.on("error")`** en el pg Pool. Te llevás "Connection closed".
- **No usar `force-dynamic`** cuando se puede `revalidate = N`.
- **No leer cookies en una page que querés cachear** — Next.js la marca dynamic.

## Seguridad

- `.env` está en `.gitignore`. **Nunca commitearlo.**
- Si un token o password aparece accidentalmente en chat, logs, commits, o
  cualquier lugar fuera de `.env` local → **rotarlo inmediatamente**:
  - Apify: https://console.apify.com/settings/integrations
  - OpenAI: https://platform.openai.com/api-keys
  - Anthropic: https://console.anthropic.com/settings/keys
  - Supabase DB password: Settings → Database → "Reset database password"
- No guardar tokens en `memory/` ni en `CLAUDE.md`.
- El proxy `/api/img` valida hostname para evitar SSRF.
- Decisiones API valida tipos y rechaza valores fuera del enum.
- RLS está activado en todas las tablas. Hoy se bypassa porque conectamos
  como `postgres`; al agregar auth, se aplicará automáticamente.

## Lecciones meta (aprendizajes del proceso)

- **Migrar de SQLite a PG en serio toma un día completo** — async cascade
  toca todo el árbol de imports.
- **Configurar la conexión es el 50% del problema** — pooler vs directo,
  IPv6, keepAlive, SSL, error handler. Si la app falla raro, sospechar
  primero del transporte.
- **Production build local es la única forma honesta de medir performance**.
  Dev mode miente.
- **IG hace todo lo posible para que NO embedees su contenido.** Lo único
  estable es su propio iframe embed (y aun así requiere login para algunos
  reels). No prometer "videos confiables" al usuario sin hostear los
  archivos uno mismo.
- **Cuando algo "funciona pero está lento", el cuello de botella suele no
  estar donde uno piensa.** En este proyecto era `raw_json` jsonb pesado
  multiplicado por 500 rows, no la latencia de DB.
- **Multi-tenant DESDE EL DÍA 1** es más fácil que migrarlo después.
  Un `workspace_id` y un `niche_id` en cada tabla cuestan poco al inicio
  y mucho cuando ya hay 10k posts.
