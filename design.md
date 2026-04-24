# CryptoGest — Design System

Sistema visual común. Objetivo: una app contable seria, densa donde toca, serena donde no, sin decoración que distraiga. Estilo **Minimal Pro** (Linear/Vercel).

## Principios

1. **Silencio visual** — cada elemento justifica su tinta. Si no aporta significado, fuera.
2. **Un solo acento** — azul (`--primary`). Los semánticos (success/warning/danger) sólo para estado, no para decoración.
3. **Texto primero** — jerarquía por peso y tamaño antes que por color.
4. **Elevación por contraste, no por sombra** — capas de superficie + hairline. Sombras grandes prohibidas en la UI crónica.
5. **Densidad intencional** — datos tabulares son densos; landing y diálogos respiran.

## Tokens

Definidos en `src/index.css`, expuestos como utilidades Tailwind en `tailwind.config.js`.

### Superficies

| Token | Uso | Utilidad Tailwind |
|---|---|---|
| `--background` | lienzo raíz | `bg-background` |
| `--surface-1` | fondo de pantalla | `bg-surface-1` |
| `--surface-2` | tarjeta / panel | `bg-surface-2` |
| `--surface-3` | hover / activo | `bg-surface-3` |
| `--hairline` | borde 1px (8–12% alpha sobre fondo) | `border-hairline` |

### Color semántico (identidad de marca)

El logo combina **candado dorado** sobre **libro azul**. Esa dualidad es la identidad.

- **`--primary`** (azul libro, HSL 218 72%) — acción interactiva, selección, foco, enlaces, iconografía cloud.
- **`--brand`** (dorado candado, HSL 42 95%) — **segundo acento, reservado**. Momentos de seguridad/confianza/novedad: icono de cifrado, Sparkles de changelog, hitos de bienvenida. Nunca para hover o estado de control.
- **Estado**: `--success` (verde), `--warning` (ámbar), `--destructive` (rojo), `--info` (cian). Sólo para indicar estado real, nunca para decoración.
- **Texto**: `--foreground` (primario), `--muted-foreground` (secundario).

**Regla de oro**: pantalla normal = azul + neutrales. El dorado aparece como puntuación, una o dos veces máximo por vista.

### Tipografía

Stack del sistema (sans-serif). Escala **congelada** — no usar tamaños fuera de esta lista:

| Tamaño | Uso |
|---|---|
| 11 (`text-[11px]`) | metadata, badges |
| 13 (`text-[13px]`) | body muted, UI controls |
| 15 (`text-[15px]`) | body default, labels |
| 18 (`text-lg`) | subtítulos |
| 28 (`text-[28px]`) | hero / wordmark |

Prohibido: `text-[9px]`, `text-[10px]`, `text-[12px]`, mezclar `text-xs`/`text-sm` arbitrariamente. Si necesitas algo distinto, justifícalo.

Titulares: `tracking-tight` (-0.02em). Mono (`font-mono`): sólo para paths, códigos, cantidades tabulares.

### Espaciado

Múltiplos de 4. Escala usada: 4, 8, 12, 16, 20, 24, 32, 48.

- Gap entre cards de lista: `gap-3` (12).
- Padding interno card: `p-4` (16) compacta, `p-5` (20) cómoda.
- Separación de secciones: `mb-6` (24).

### Radios

| Token | Uso |
|---|---|
| `rounded-sm` | inputs pequeños |
| `rounded-md` | botones, cards |
| `rounded-lg` | diálogos, panels |

Eliminar `rounded-2xl` y mayores — se sienten infantiles en contexto contable.

## Elevación

Tres niveles. Ninguno usa box-shadow grande.

```
Nivel 0: bg-surface-1 (fondo pantalla)
Nivel 1: bg-surface-2 + border-hairline (card)
Nivel 2: bg-surface-3 + border-hairline (card hover / activo)
Diálogos: bg-surface-2 + border-hairline + shadow-xl (excepción, sólo modales)
```

## Estados

| Estado | Composición |
|---|---|
| Default | `bg-surface-2 border border-hairline` |
| Hover | `bg-surface-3 border-hairline/60` |
| Selected / last-used | `border-l-2 border-l-primary` + pill etiqueta |
| Focus | `ring-2 ring-primary ring-offset-0` |
| Disabled | `opacity-50 pointer-events-none` |
| Error | `border-destructive/40 bg-destructive/5` |

## Iconografía

- **Única fuente**: `lucide-react`.
- Tamaños: 14 (metadata), 16 (botón), 20 (tile), 24 (hero). Nada intermedio.
- Stroke: 1.75 por defecto (default de Lucide).
- Color: hereda de `text-*`. No inline colors.

## Motion

- **Default**: 150ms `ease-out`. Hover / focus / color shifts.
- **Expansión**: 250ms `cubic-bezier(0.2, 0.8, 0.3, 1)` (`animate-expand`).
- **Entrada con stagger**: 350ms fade-up (`animate-slide-up-fade`), delay por item ≤40ms, cap a los primeros 8 items.
- `prefers-reduced-motion: reduce` → todas las animaciones a 1ms (ya aplicado en `index.css`).

## Composición (pantallas de entrada)

### Hero

```
[logo 32px] Producto              versión pill
—————————————————————————
Subtítulo 15px muted (una línea)
```

### Grid 2 columnas (selector + changelog)

```
lg:grid-cols-[minmax(0,1fr)_360px] gap-8
Debajo de lg: sólo columna principal.
```

### Lista de items

- Card uniforme (altura mínima visual 64px).
- Icono 40×40 cuadrado, fondo `surface-3`.
- Título 15px + meta 13px muted en UNA línea.
- Acciones icon-button 28px a opacidad 40% → 100% en hover (nunca `opacity-0`; evita reflow visual).
- Chevron 16px muted al final.

## Anti-patrones

- ❌ Mezclar `text-[9px]` con `text-xs` con `text-sm` en el mismo componente.
- ❌ `bg-slate-*` / `text-white` / `bg-emerald-*` / `text-blue-*` hard-coded. Usa tokens (`surface-*`, `foreground`, `muted-foreground`, `success`, `primary`, etc.).
- ❌ Gradientes decorativos de fondo (blobs).
- ❌ `opacity-0 group-hover:opacity-100` para acciones frecuentes (salto visual).
- ❌ Acumular dorado (`brand`) como hover o relleno — quema la reserva; el dorado debe ser puntuación.
- ❌ Emojis de iconos. Siempre Lucide.
- ❌ Sombras grandes en cards fuera de modales.

## Cómo aplicar

1. Referencia este documento en PRs que toquen UI: "follows design.md §Lista de items".
2. Si necesitas un token o tamaño nuevo, añade aquí primero, luego en `index.css`/`tailwind.config.js`.
3. Para rediseñar una pantalla: localiza los anti-patrones, sustituye por tokens, recorta la escala tipográfica a la lista oficial.
