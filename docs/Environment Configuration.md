# Konfiguráció-kezelés

A rendszer indításakor a nyers környezeti változók (`process.env`) egy strukturált, típusos konfigurációs objektummá alakulnak. Ez az objektum kerül átadásra a `createServices` factory függvénynek, és a services rétegen keresztül válik elérhetővé a modulok számára.

---

## Az `Env` osztály

A környezeti változók beolvasása és validálása az `Env` osztályon keresztül történik. Az osztály példányosításakor meg kell adni a projekt gyökerének abszolút útvonalát — ez a `file` és `dir` metódusok által visszaadott útvonalak alapja.

```typescript
import { Env } from "...";
export const env = new Env(path.resolve(__dirname, "../"));
```

> ⚠️ A projekt gyökerét a felhasználó adja meg explicit módon. Sem `process.cwd()`, sem automatikus `package.json` keresés nem történik — ezek futtatási konvenciótól függenek és nem megbízhatók.

Minden metódus:
- megkapja a környezeti változó nevét és opcionálisan egy alapértelmezett értéket,
- ha a változó hiányzik és nincs alapértelmezett érték, kivételt dob,
- ha a változó nem konvertálható a várt típusra, kivételt dob.

Ez biztosítja, hogy a rendszer **már induláskor megbukjon**, ha a konfiguráció hiányos vagy hibás — nem futásidőben, egy véletlenszerű kérés közben.

---

## Metódusok

### Primitív típusok

| Metódus | Visszatérési típus | Megjegyzés |
|---|---|---|
| `env.string(key, default?, trim?)` | `string` | `trim` default `true` |
| `env.int(key, default?, radix?)` | `number` | `radix` default `10` |
| `env.float(key, default?)` | `number` | |
| `env.boolean(key, default?)` | `boolean` | Elfogadott: `1/0`, `yes/no`, `true/false` |

### Összetett típusok

| Metódus | Visszatérési típus | Megjegyzés |
|---|---|---|
| `env.url(key, default?)` | `URL` | `new URL()` validál, abszolút utat ad vissza |
| `env.regex(key, default?)` | `RegExp` | `new RegExp()` validál |
| `env.list(key, parser, default?, separator?)` | `T[]` | `separator` default `,` |

### Fájlrendszer típusok

| Metódus | Visszatérési típus | Megjegyzés |
|---|---|---|
| `env.file(key, default?, onMissing?, stayInProject?)` | `string` | Abszolút útvonalat ad vissza |
| `env.dir(key, default?, onMissing?, stayInProject?)` | `string` | Abszolút útvonalat ad vissza |

A `file` és `dir` metódusok mindig abszolút útvonalat adnak vissza — a hívó helyen nem kell a relatív/abszolút kérdéssel foglalkozni.

Az `onMissing` paraméter háromféle értéket vehet fel:
- `true` (default) — kivételt dob, ha a path nem létezik,
- `false` — csendesen visszaadja a feloldott útvonalat,
- `(path: string) => void` — callback, amely meghívódik ha a path nem létezik (pl. könyvtár létrehozása).

A `stayInProject` (default `true`) megakadályozza, hogy a path kilépjen a projekt gyökeréből — path traversal védelem.

A `list` metódus egy generikus parsert vár második paraméterként:

```typescript
env.list("ALLOWED_PORTS", v => parseInt(v, 10))
env.list("ALLOWED_ORIGINS", v => new URL(v))
env.list("FEATURE_FLAGS", v => v) // string lista
```

---

## A konfigurációs objektum felépítése

A nyers környezeti változókból egy strukturált objektum épül fel, amelynek mezői az egyes alrendszerek konfigurációját csoportosítják. Minden érték már a megfelelő TypeScript típussal rendelkezik — a services és modulok soha nem látják a nyers string értékeket.

```typescript
const config = {
    database: {
        connectionString: env.string("DATABASE_URL"),
        max:              env.int("DB_POOL_MAX", 20),
        min:              env.int("DB_POOL_MIN", 2),
        // ...
    },
    auth: {
        jwt: {
            secret:       env.string("JWT_SECRET"),
            exp:          env.int("JWT_EXPIRATION", 60 * 60 * 24 * 7),
            trust_window: env.int("AUTH_TRUST_WINDOW", 60 * 5),
        },
        cookie: {
            name:         env.string("AUTH_COOKIE", "AuthCookie"),
            max_age:      env.int("COOKIE_MAX_AGE", 7 * 24 * 60 * 60),
        },
        hash_salt_rounds: env.int("SALT_ROUNDS", 10),
    },
};
```

A struktúra tükrözi a rendszer alrendszereit: minden service a saját szeletét kapja meg, nem a teljes konfigurációt.

---

## Szabályok

| # | Szabály |
|---|---------|
| 1 | `process.env`-t csak a config objektum építésekor szabad olvasni |
| 2 | Minden értéket `env.*` metóduson keresztül kell beolvasni — nyers `process.env[key]` string használata tilos |
| 3 | Env változók neve csak `A-Z`, `0-9`, `_` karaktereket tartalmazhat, és nem kezdődhet számmal |
| 4 | A config objektum struktúrája tükrözze az alrendszerek határait |
| 5 | A services csak a saját konfigurációs szeletét kapja meg, nem a teljes objektumot |
| 6 | A modulok nem kapnak közvetlen config referenciát — csak a services-en keresztül érnek el konfigurációs értékeket |
| 7 | Számítások (pl. `60 * 60 * 24`) a config objektumban történnek, nem env változóban |
| 8 | A projekt gyökerét explicit módon kell megadni az `Env` konstruktorában |