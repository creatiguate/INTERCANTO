# INTERCANTO · Temporada 3 | Web de votaciones REAL

**El diseño original está intacto:** `public/index.html`, `public/styles.css`, fotografías, logotipos y animaciones. Se retiró el simulador de acceso y votos. Sin Supabase no hay votaciones falsas: aparece un error de conexión.

## Google, sin vueltas

Si Google ya te funciona en `http://localhost:8787`, no necesitas crear otra cuenta ni otro Client ID. Se usa el mismo Client ID de tipo **Web** en Google Cloud, Supabase y la configuración del Worker.

Lo que cambia al publicar es el **dominio**: Google y Supabase deben reconocer la dirección desde la que abrirán la web y volverán después del inicio de sesión. Subir el código a GitHub, por sí solo, no cambia nada ni requiere configurar otro Google. Si además activas GitHub Pages, agrega su dominio a las listas indicadas abajo.

La opción más sencilla para publicar la aplicación completa es desplegarla en Cloudflare Workers. GitHub Pages es opcional: solo hace falta si quieres servir el frontend desde GitHub y conectar ese sitio con el Worker.

## 1. Abrir en Visual Studio Code (Windows)

1. Descomprime el ZIP en una carpeta, ábrela en **Archivo > Abrir carpeta** de VS Code.
2. Instala **Node.js 22 o superior** si todavía no lo tienes (comprueba `node -v`).
3. En Terminal > Nueva terminal ejecuta:

   ```powershell
   npm ci
   npm run local:setup
   npm run doctor
   npm run dev
   ```

4. Abre **http://localhost:8787/**. Es la página REAL; no uses Live Server ni hagas doble clic en el HTML para probar votos. También puedes usar `INICIAR_INTERCANTO.bat`, o en VS Code **Terminal > Run Task > Intercanto: iniciar sitio REAL** (primero instala dependencias y configura las claves).

`npm run local:setup` te pregunta los siguientes valores (solo localmente):

- `SUPABASE_URL`: URL del proyecto, por ejemplo `https://xxxx.supabase.co`.
- `SUPABASE_PUBLISHABLE_KEY`: clave **publishable** (`sb_publishable_...`) o **anon** heredada.
- `SUPABASE_SERVER_KEY`: clave **secret** (`sb_secret_...`) o **service_role** heredada. **Solo servidor.**
- `GOOGLE_CLIENT_ID`: ID de cliente OAuth de Google tipo **Web**, terminado en `.apps.googleusercontent.com`.
- `IP_HASH_SECRET`: se crea automáticamente; nunca lo publiques.

Se guardan en `.dev.vars`, excluido de Git. Ninguna clave privada está incluida en este ZIP. En `http://localhost:8787` el Worker siempre consulta su API local, aunque configures `API_ORIGIN` para GitHub Pages.

### Si aparece “La API devolvió una página en lugar de JSON”

La página se abrió desde un servidor estático (por ejemplo, Live Server o GitHub Pages) y no encuentra el Worker. Para probar en local, configura `.dev.vars` con `npm run local:setup`, ejecuta `npm run doctor` y `npm run dev`, y abre **http://localhost:8787**. No abras el HTML directamente ni uses Live Server.

Para GitHub Pages, primero despliega el Worker y luego configura `API_ORIGIN` en `public/backend-config.js` con su URL HTTPS real. El botón de Google está visible desde el primer momento; cuando Google Identity Services termina de cargar, lo reemplaza por el botón oficial. Si esa carga falla, el botón visible usa el flujo OAuth de Supabase. Los errores de configuración se muestran en el encabezado, sin abrir el diálogo automáticamente. El diálogo de registro aparece solo cuando alguien intenta votar.

## Subir el código a un repositorio de GitHub

Esto guarda el código en GitHub, pero **no publica por sí solo la aplicación** ni reemplaza el Worker de Cloudflare que necesita la votación real.

1. En GitHub crea un repositorio vacío, sin README, licencia ni `.gitignore` iniciales.
2. Abre PowerShell en la carpeta del proyecto. Si todavía no tiene Git configurado, inicialízalo:

   ```powershell
   git init
   ```

3. Comprueba los archivos antes de agregarlos:

   ```powershell
   git check-ignore -v .dev.vars node_modules
   git status --short
   ```

   `.dev.vars` y `node_modules/` están excluidos por `.gitignore`. No agregues archivos con claves, contraseñas o tokens. Luego, reemplaza la URL por la de tu repositorio y ejecuta:

   ```powershell
   git add .
   git status --short
   git commit -m "Initial Intercanto T3 project"
   git branch -M main
   git remote add origin https://github.com/TU-USUARIO/TU-REPOSITORIO.git
   git push -u origin main
   ```

   Si ya existe un repositorio Git, no ejecutes `git init` ni `git remote add`; revisa su remoto con `git remote -v` y sigue el flujo normal de cambios de ese repositorio.
4. Incluye `package-lock.json`; permite instalaciones reproducibles con `npm ci`. No subas `node_modules/`, `.dev.vars` ni secretos.

## 2. Crear / comprobar la base de datos Supabase

Abre **Supabase Dashboard > SQL Editor**:

1. Si **NO** tienes `public.votes`, ejecuta primero `supabase/migrations/20261109000000_create_intercanto_votes.sql`. Si ya existe de un proyecto anterior, **no vuelvas a crearla**.
2. Ejecuta `supabase/migrations/20261111000000_account_voting_and_onboarding.sql` y después las migraciones `20261112000000_optional_partner_visits.sql` y `20261112000100_optional_partner_flags.sql`. Eliminan el requisito de visitar aliados para votar; cada cuenta conserva sus diez votos. **Las migraciones no se ejecutan solas** al iniciar la web.
3. En `Authentication > Providers > Google` habilita Google y configura el **Client ID** y **Client Secret** de Google Cloud. La clave secreta de Google va solo en Supabase; nunca en el sitio o este repositorio.
4. Entra una vez a la web con tu cuenta Google y autorízate como administrador en SQL Editor (cambia el correo):

   ```sql
   insert into public.voting_admins (user_id)
   select id from auth.users where email = 'TU-CORREO-GOOGLE'
   on conflict (user_id) do nothing;
   ```

5. Si quieres, administra los enlaces de los aliados en **http://localhost:8787/admin**. Las visitas son opcionales y no bloquean la votación.

La aplicación ofrece diez votos por cuenta de Google. En cada voto, la persona elige cuántos usar y confirma que se asignarán al participante seleccionado. La sección de aliados es informativa: visitar sus páginas no es requisito y no agrega votos.

### Google Cloud (imprescindible)

En **Google Cloud Console > APIs y servicios > Credenciales > ID de cliente OAuth (Aplicación web)**:

- **Orígenes JavaScript autorizados:** agrega `http://localhost:8787` y `http://127.0.0.1:8787` para desarrollo local (usa el que aparece en la barra del navegador); agrega también el origen HTTPS de tu Worker si usarás la aplicación allí y `https://TU-USUARIO.github.io` si usarás GitHub Pages (solo el *origen*, sin nombre de repositorio).
- **URIs de redireccionamiento autorizados:** `https://TU-PROJECT-REF.supabase.co/auth/v1/callback` (el callback de Supabase, **no** la URL de GitHub Pages).
- Si Google OAuth está en modo pruebas, agrega los correos permitidos como usuarios de prueba o completa la configuración de publicación apropiada.

En **Supabase > Authentication > URL Configuration > Redirect URLs**, permite:

```text
http://localhost:8787/**
http://127.0.0.1:8787/**
https://TU-WORKER.TU-SUBDOMINIO.workers.dev/**
https://TU-USUARIO.github.io/TU-REPOSITORIO/**
```

También puedes permitir tu dominio propio. Usa los valores reales, no los literales `TU-...`.

## 3. Publicar API + sitio completo en Cloudflare Workers

El Worker es el servidor que verifica cada sesión de Google, controla las reglas y guarda los votos en Supabase. **GitHub Pages solo no puede hacerlo.**

```powershell
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SERVER_KEY
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put IP_HASH_SECRET
npm run deploy
```

Wrangler te pedirá los valores de cada secreto por terminal. Para `IP_HASH_SECRET`, pega el mismo valor largo que está en tu `.dev.vars` (o genera otro aleatorio). Después del deploy, anota el enlace HTTPS **real** que Wrangler devuelve, por ejemplo `https://nombre.usuario.workers.dev`. Desde ese enlace ya puedes mostrar **toda** la página, su panel `/admin` y sus perfiles con URL planetaria (como `/marte`), sin GitHub Pages.

**No publiques `.dev.vars` ni el secret de Supabase**; `.gitignore` los protege, pero revísalo antes de cualquier commit. GitHub sirve para guardar/versionar el proyecto y, si deseas, hospedar una copia del frontend.

## 4. Si quieres que se vea desde GitHub Pages

Esta edición del proyecto también admite un frontend estático **real**, conectado al Worker (sin simulación):

1. Publica el Worker primero y copia **su URL HTTPS real**.
2. Edita solo la primera constante de `public/backend-config.js`, por ejemplo:

   ```js
   export const API_ORIGIN = 'https://nombre.usuario.workers.dev';
   ```

   Es únicamente la dirección pública de la API. **No coloques ninguna clave privada ni de Google aquí.**
3. `wrangler.jsonc` ya autoriza el origen de GitHub Pages (`https://creatiguate.github.io`) mediante `FRONTEND_ORIGINS`; no es un secreto. Si usas otro dominio, cambia esa variable por el origen HTTPS exacto y vuelve a desplegar el Worker.

4. Sube la carpeta **completa** del proyecto a un repositorio de GitHub (con `public/` y `src/`); no subas `.dev.vars` ni `node_modules/`.
5. En el repositorio, abre **Settings > Pages > Build and deployment > Deploy from a branch > main > /(root) > Save**. En tu enlace de Pages, `index.html` de la raíz entra directamente a la web original en `public/index.html`, sin mostrar selector de demo.
6. En Google Cloud agrega `https://TU-USUARIO.github.io` a los orígenes y en Supabase permite `https://TU-USUARIO.github.io/TU-REPOSITORIO/**` en redirects (sección 2).

**Importante:** la página en GitHub Pages mostrará tu diseño, ranking y voto REAL solo cuando el Worker esté desplegado y las claves/CORS estén configurados. Si no hay backend, verás un mensaje de conexión en lugar de votos de fantasía. Las URLs compartidas de participantes en GitHub Pages usan `?participant=marte`; las de Cloudflare Worker usan `/marte` y generan metadatos específicos para compartir.

En GitHub Pages el panel de administración está en `.../public/admin.html`; en Cloudflare en `/admin`. Ambos usan la misma base de datos.

## 5. Revisar Supabase y Google

```powershell
npm run doctor
npm run doctor:online
npm test
```

- `doctor` comprueba localmente que estén presentes y tengan formato correcto URL, claves y Google Client ID **sin mostrar secretos**.
- `doctor:online` prueba en lectura la conexión REST a Supabase, la función del ranking, la lista de siete participantes y la disponibilidad de Supabase Auth. No escribe votos ni configura Google Cloud. Si falla, revisa migraciones, claves y red.
- `npm test` ejecuta pruebas de autorización, API, CORS y protección de claves privadas.

**Ni el ZIP ni el código pueden verificar por sí solos los orígenes autorizados de Google Cloud, las claves privadas que no incluiste o las migraciones de tu proyecto remoto.** Esa comprobación final se realiza con las credenciales configuradas, el diagnóstico y un inicio de sesión real.

## Estructura (lo esencial)

| Archivo / carpeta | Para qué sirve |
|---|---|
| `public/index.html` + `public/styles.css` + `public/assets/` | **Diseño original**, fotografías y logos (sin cambios visuales) |
| `public/app.js`, `public/config.js`, `public/js/` | Interactividad de la página, Google y peticiones de votos |
| `public/backend-config.js` | Dirección **pública** del Worker para GitHub Pages |
| `src/` | API privada del Worker, validación del usuario y reglas de voto |
| `supabase/migrations/` | SQL de base de datos que debes aplicar en Supabase |
| `.dev.vars` | Tus claves **locales**, creadas por setup y **no incluidas en Git** |
| `wrangler.jsonc` | Configuración del servidor Cloudflare |
| `INICIAR_INTERCANTO.bat` | Inicio en Windows |
| `tests/` y `scripts/doctor.mjs` | Comprobaciones de seguridad y funcionamiento |

**Reglas actuales (no alteradas):** máximo 10 votos por cuenta de Google y edición, repartibles entre participantes; IP usada como control adicional de frecuencia, **no** como límite de un único voto por IP; ranking público agregado y votos registrados en SQL. Si quieres restringir a *un voto por IP* sería una regla distinta y habría que cambiar también la lógica de diez votos.
