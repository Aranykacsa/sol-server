# @atom-forge/ui Component Reference

This project uses `@atom-forge/ui` for the Switch, Badge, and Button components, plus the `AtomForge` theme wrapper.

---

## AtomForge wrapper

Every page must be wrapped in `<AtomForge>`. This is done once in `src/routes/+layout.svelte`:

```svelte
<script lang="ts">
  import { AtomForge } from '@atom-forge/ui';
  let { children } = $props();
</script>

<AtomForge dark>
  {@render children()}
</AtomForge>
```

**Critical:** `AtomForge` is a Svelte 5 runes component. The SvelteKit compiler must process it in runes mode. Do NOT add `@atom-forge` to any runes exclusion list in `svelte.config.js`. If the wrapper is excluded from runes, it silently breaks (no error, wrong rendering).

Props:
- `dark` — boolean, enables dark theme (no value needed: `<AtomForge dark>`)

---

## Badge

Displays a small status pill.

```svelte
<Badge color="accent">online</Badge>
<Badge color="red">error</Badge>
<Badge>offline</Badge>   <!-- default/grey, no color prop -->
```

**`color` prop values:** `'accent' | 'red' | 'green' | 'blue'`

**Do NOT use `variant`** — there is no `variant` prop. The prop is `color`.

---

## Switch

A toggle switch with two-way binding.

```svelte
<script lang="ts">
  import { Switch } from '@atom-forge/ui';
  let on = $state(false);

  $effect(() => {
    // React to changes here — no onchange prop exists
    console.log('switched to', on);
  });
</script>

<Switch bind:value={on} />
```

**`bind:value`** — the controlled prop. Always use `bind:value`, not `value=`.

**No `onchange` / `on:change`** — there is no event prop. Use `$effect` to react to value changes.

---

## Button

```svelte
<!-- Default (primary) -->
<Button>Click me</Button>

<!-- Variants — boolean props, no value needed -->
<Button secondary>Secondary</Button>
<Button ghost>Ghost</Button>
<Button destructive>Delete</Button>

<!-- Sizes — boolean props -->
<Button small>Small</Button>
<Button compact>Compact</Button>
<Button micro>Micro</Button>
```

**Variants:** `ghost`, `secondary`, `destructive` — boolean props, use without `={true}`

**Sizes:** `small`, `compact`, `micro` — boolean props

---

## Design tokens

These are Tailwind CSS utilities provided by @atom-forge/ui's CSS layer. Use them via standard Tailwind class syntax:

| Token | Usage |
|-------|-------|
| `bg-base` | Page/app background |
| `bg-raised` | Card / elevated surface background |
| `border-canvas` | Standard border color |
| `text-control-c` | Primary text on interactive controls |
| `text-muted-c` | Secondary/muted label text |
| `bg-accent` | Accent highlight (green dot for "online", etc.) |

Example:
```svelte
<div class="bg-raised border border-canvas rounded-lg px-4 py-3">
  <span class="text-control-c">Label</span>
  <span class="text-muted-c text-xs">subtitle</span>
</div>
```

---

## CSS setup

`@atom-forge/ui` styles are imported in `src/routes/layout.css`, which is imported by `+layout.svelte`:

```ts
import './layout.css';
```

Do not import the atom-forge CSS in individual components — it is loaded once globally.
