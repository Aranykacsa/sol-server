# Modul- és Service-alapú Rendszerarchitektúra

Ez a dokumentáció a rendszer moduláris architektúráját mutatja be. A rendszer **Dependency Injection** és **Factory Pattern** alapú struktúrát követ, amely elválasztja az alacsony szintű erőforrásokat (Services) a magas szintű üzleti logikától (Modules).

---

## 1. Az Architektúra Alappillérei

A rendszer két fő rétegre oszlik, amelyek inicializálása szigorú hierarchiában történik.

### Szolgáltatások (Services)

A Services réteg felelős az infrastruktúrával való kapcsolattartásért és az alacsony szintű segédfunkciókért. A szolgáltatások nem ismerik az üzleti logikát, és csak más szolgáltatásoktól függhetnek.

### Modulok (Modules)

A Modules réteg tartalmazza az alkalmazás üzleti logikáját. A modulok nem osztályok, hanem **függvénygyűjtemények**: a factory függvény egy plain objektumot ad vissza, amelynek mezői az egyes üzleti műveleteket valósítják meg. A belső segédfüggvények zárón belül maradnak, a publikus API-ba csak a külvilág számára releváns műveletek kerülnek. A modulok felhasználhatják a szolgáltatásokat, és hivatkozhatnak más modulokra is.

---

## 2. Inicializációs Minták (Factory Függvények)

### A `Config` típus

Minden service és modul exportálja a saját konfigurációs típusát. A `Config` típus ezek intersection-je — így minden komponens önmaga definiálja, milyen konfigurációt vár, és a központi `Config` csak összerakja őket.

```typescript
// services/foo.ts
export type FooConfig = { foo: { connectionString: string } };

// modules/bar.ts
export type BarConfig = { bar: { secret: string; exp: number } };

// index.ts
import type { FooConfig } from "$services/foo";
import type { BarConfig } from "$modules/bar";

export type Config =
    & FooConfig
    & BarConfig;
```

### Szolgáltatások inicializálása (`createServices`)

A `createServices` függvény hozza létre az összes szolgáltatást a megadott konfiguráció alapján. A szolgáltatások egymás között is függhetnek, ezt az inicializálási sorrenddel és a közös `services` referencia átadásával kell kezelni.

```typescript
export type Services = {
    foo: ReturnType<typeof createFooService>;
    bar: ReturnType<typeof createBarService>;
};

export function createServices(cfg: Config): Services {
    const services = {} as Services;
    services.foo = createFooService(cfg);
    services.bar = createBarService(services); // függhet más service-től
    return services;
}
```

### Modulok inicializálása (`createModules`)

A `createModules` függvény építi fel az üzleti logikai réteget. Minden modul megkapja a teljes `services` és `modules` referenciát, így hozzáférhet bármely szolgáltatáshoz és más modulhoz.

```typescript
export type Modules = {
    foo: ReturnType<typeof createFooModule>;
    bar: ReturnType<typeof createBarModule>;
};

export function createModules(services: Services): Modules {
    const modules = {} as Modules;
    modules.foo = createFooModule(modules, services);
    modules.bar = createBarModule(modules, services);
    return modules;
}
```

> ⚠️ A `modules` objektum referencia szerint kerül átadásra, és a példányosítás során fokozatosan töltődik fel. Ebből következik, hogy a modulok más modulokra csak **metódushívás során** (lazy módon) hivatkozhatnak — sosem a factory függvény futása közben.

---

## 3. Összeállítás (`index.ts`)

Az `index.ts` a belépési pont, ahol a `Config` típus, a `Services` és `Modules` típusok, a factory függvények és a példányosítás egy helyen találkoznak. Az inicializálás sorrendje kötött: először a konfiguráció épül fel, majd a services, végül a modules.

```typescript
// index.ts
import type { FooConfig } from "$services/foo";
import type { BarConfig } from "$modules/bar";

export type Config =
    & FooConfig
    & BarConfig;

const env = new Env(path.resolve(__dirname, "../"));

const rawConfig: Config = {
    foo: { connectionString: env.string("DATABASE_URL") },
    bar: { secret: env.string("JWT_SECRET"), exp: env.int("JWT_EXP", 3600) },
};

export const services = createServices(rawConfig);
export const modules = createModules(services);
```

---

## 4. Tervezési Elvek

**Dependency Injection** — Nincsenek globális állapotok vagy rejtett import-függőségek. Minden komponens explicit módon kapja meg a függőségeit, ami átláthatóvá teszi a függőségi fát.

**Factory függvények** — Minden komponens egy factory függvényen keresztül jön létre, amely garantálja, hogy a példányosítás csak akkor történik meg, ha minden szükséges függőség már rendelkezésre áll.

**Rétegződés** — Az inicializáció szigorú `Config → Services → Modules` hierarchiát követ. A modulok között lehetnek kereszt-referenciák, ezek azonban mindig lazy módon, metódushívás során oldódnak fel — nem körkörös inicializációs függőségek.

**Tesztelhetőség** — A factory függvények lehetővé teszik, hogy tesztelés során mock implementációk kerüljenek beinjektálásra a valódi függőségek helyett.