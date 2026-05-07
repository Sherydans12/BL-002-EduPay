<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## BL-002 — Frontend para agentes

Antes de tocar UI del dashboard (colores, formularios, listas desplegables):

1. Lee **`docs/UI-STYLES.md`** — tokens `--color-*`, componentes `DropdownChevron` / `NativeSelectField`, Popover+Command, glass, tablas y checklist.
2. No introduzcas selects con flecha nativa suelta ni el carácter `▼`; usa los patrones documentados.
3. Los tokens de color “de la app” viven en `src/app/globals.css` (`:root` dentro de `@layer base`); no asumas solo los tokens shadcn del mismo archivo.
