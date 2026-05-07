# Guía de UI y estilos (frontend BL-002)

Documentación para humanos y agentes: **colores**, **formularios**, **desplegables**, efectos y convenciones del dashboard. La fuente de verdad de los tokens de la app está en `src/app/globals.css`.

---

## 1. Dos sistemas de color (no mezclarlos sin motivo)

### Tokens de la aplicación (`--color-*`)

El dashboard principal usa variables definidas en `:root` dentro de `@layer base` en `globals.css`. Son la referencia para páginas “glass” / slate oscuro.

| Token | Uso típico |
|--------|------------|
| `--color-bg` | Fondo general |
| `--color-surface` | Paneles, inputs, tablas |
| `--color-surface-hover` | Hover en filas / superficies |
| `--color-border`, `--color-border-subtle` | Bordes |
| `--color-primary`, `--color-primary-hover`, `--color-primary-light` | Acciones, foco, badges suaves |
| `--color-success`, `--color-danger`, `--color-warning` | Estados (montos OK, errores, alertas) |
| `--color-text` | Texto principal |
| `--color-text-secondary` | Texto secundario |
| `--color-text-muted` | Placeholders, hints, iconos secundarios |

En Tailwind se referencian así: `bg-[var(--color-surface)]`, `text-[var(--color-text-muted)]`, `border-[var(--color-border)]`, etc.

### Tokens shadcn / tema (`--background`, `--primary`, `bg-card`, …)

Los componentes en `src/components/ui/` (Radix/Base UI + shadcn) usan variables como `--primary`, `--muted-foreground`, `border-border`, `bg-popover`. Están en el bloque `:root` / `.dark` más abajo en el mismo `globals.css`.

**Regla:** En páginas nuevas del dashboard alineadas con el resto del sitio, prioriza **`--color-*`** para layout, tarjetas propias y campos “custom”. Usa componentes shadcn cuando convenga (Dialog, Select primitivo, etc.) y **no** sustituyas sus tokens internos salvo que sea necesario.

---

## 2. Patrones de layout

- **Tarjetas / secciones:** `glass rounded-2xl p-6` (clase `.glass` en `globals.css`).
- **Espaciado vertical entre bloques:** `space-y-6` o `space-y-8` según densidad.
- **Animación de entrada:** `animate-fade-in` en contenedores que entran en vista.

---

## 3. Campos de formulario (texto, fecha, número)

Patrón habitual en páginas dashboard:

- Fondo: `bg-[var(--color-bg)]` o `bg-[var(--color-surface)]`
- Borde: `border border-[var(--color-border)]`
- Texto: `text-white` o `text-[var(--color-text)]`
- Foco: `focus:border-[var(--color-primary)] outline-none`
- Bordes redondeados: `rounded-xl`
- Labels: `text-sm font-medium text-[var(--color-text-secondary)]`, a veces labels compactos en `text-xs uppercase tracking-wider text-[var(--color-text-muted)]`

**Errores de validación:** `text-red-400 text-xs mt-1` (o componente equivalente).

Los inputs **`type="date"`** (y datetime/time) ya tienen estilos globales en `globals.css` (`color-scheme: dark`, icono de calendario personalizado). No hace falta duplicar lógica salvo casos especiales.

---

## 4. Desplegables (obligatorio para consistencia)

### 4.1 Lista buscable: `Popover` + `Command` (alumno, curso, rol, etc.)

No uses el carácter `▼` ni un ícono distinto aislado.

1. Importa desde `@/components/ui/dropdown-chevron`:
   - **`DropdownChevron`**
2. El **trigger** debe ser un `<button type="button">` con:
   - `flex items-center gap-2`
   - Texto en `<span className="min-w-0 flex-1 truncate">...</span>`
   - **`<DropdownChevron />`** al final (mismo chevron que el resto del sistema).

Ejemplo mínimo:

```tsx
import { DropdownChevron } from "@/components/ui/dropdown-chevron";

<button type="button" className="... flex items-center gap-2 text-left">
  <span className="min-w-0 flex-1 truncate">{label}</span>
  <DropdownChevron />
</button>
```

**Popover sobre tablas o modales:** usa `PopoverContent` con `className` que incluya `z-[60]` si el contenido queda tapado.

### 4.2 `<select>` nativo (curso, método de pago, filtros simples)

El navegador dibuja una flecha distinta y mal alineada si se deja el select pelado.

1. Importa **`NativeSelectField`** desde `@/components/ui/dropdown-chevron`.
2. Envuelve el único `<select>` hijo:

```tsx
import { NativeSelectField } from "@/components/ui/dropdown-chevron";

<NativeSelectField>
  <select className="w-full ... tus clases habituales">
    ...
  </select>
</NativeSelectField>
```

`NativeSelectField` aplica `appearance-none`, `pr-10` al select y superpone el mismo **ChevronDown** que los Popover.

Si el fondo del campo no usa los tokens `--color-*` (pantalla legacy), puedes ajustar solo el ícono:

```tsx
<NativeSelectField chevronClassName="text-gray-400 opacity-90">
  ...
</NativeSelectField>
```

### 4.3 Select de shadcn (`SelectTrigger` en `components/ui/select.tsx`)

Ya incluye `ChevronDownIcon`. Úsalo cuando el flujo encaje con el primitivo; para combobox “buscar y elegir”, sigue **Popover + Command + DropdownChevron**.

---

## 5. Botones principales y secundarios

- **Primario:** `bg-[var(--color-primary)]`, `hover:bg-[var(--color-primary-hover)]`, texto blanco, `rounded-xl`.
- **Secundario / borde:** `border border-[var(--color-border)]`, hover `bg-[var(--color-surface-hover)]`.
- **Destructivo:** texto o borde rojo coherente con `--color-danger` donde aplique.

---

## 6. Iconos

- Librería: **Lucide React** (`lucide-react`).
- Tamaño habitual en línea con texto: `size-4` (equivalente `w-4 h-4`).
- En triggers de dropdown usa **`DropdownChevron`** en lugar de iconos arbitrarios.

---

## 7. Tablas y paginación

- Cabeceras: `text-xs text-[var(--color-text-muted)] uppercase tracking-wider`.
- Filas: `hover:bg-[var(--color-surface-hover)]`, divisores `divide-[var(--color-border)]`.
- Si existe componente compartido de paginación (`table-pagination` u otro), reutilízalo antes de duplicar markup.

---

## 8. Checklist rápido para una página nueva

1. ¿Fondo y bordes usan `--color-*` como el resto del dashboard?
2. ¿Labels y texto secundario siguen la jerarquía `--color-text` / `secondary` / `muted`?
3. ¿Todo desplegable visual usa **DropdownChevron** o **NativeSelectField**?
4. ¿El trigger del combobox tiene **truncate** para nombres largos?
5. ¿Popover necesita **z-[60]** encima de tablas o overlays?

---

## 9. Archivos clave

| Archivo | Contenido |
|---------|-----------|
| `src/app/globals.css` | Tokens `--color-*`, `.glass`, animaciones, inputs fecha |
| `src/components/ui/dropdown-chevron.tsx` | `DropdownChevron`, `NativeSelectField`, `NativeSelectChevron` |
| `src/components/ui/popover.tsx` | Popover |
| `src/components/ui/command.tsx` | Command / lista filtrable |
| `src/components/ui/select.tsx` | Select shadcn con chevron |

Actualiza esta guía si introduces un nuevo patrón global (por ejemplo un wrapper de campo estándar).
