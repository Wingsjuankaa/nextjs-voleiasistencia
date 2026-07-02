# Control de Asistencia

Aplicacion web en Next.js para crear grupos, registrar asistencia por fecha y revisar resumenes porcentuales. Parte del prototipo `asistencia.html`, pero usa login con Google, API Routes y Firestore.

## Stack

- Next.js con Pages Router.
- Firebase Auth para login con Google.
- Firebase Admin SDK en API Routes para leer y escribir Firestore desde servidor.
- Firestore Rules cerradas para impedir acceso directo desde el navegador.
- Pensada para Vercel Hobby + Firebase Spark.

## Configuracion local

1. Crea un proyecto en Firebase.
2. Activa Authentication con proveedor Google.
3. Crea una base Firestore.
4. Crea un service account en Firebase y guarda el JSON.
5. Copia `.env.example` a `.env.local` y completa:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json
FIREBASE_SERVICE_ACCOUNT_JSON=
ALLOWED_GOOGLE_EMAILS=
```

Para desarrollo local, descarga una clave privada en Firebase Console > Configuracion del proyecto > Cuentas de servicio > Generar nueva clave privada, guardala como `serviceAccountKey.json` en la raiz del proyecto y deja `FIREBASE_SERVICE_ACCOUNT_PATH=./serviceAccountKey.json`.

Para Vercel, usa `FIREBASE_SERVICE_ACCOUNT_JSON` con el JSON completo del service account. Si el `private_key` queda en una sola linea con `\n`, la app lo normaliza automaticamente.

Para restringir el acceso a una o varias cuentas Google, completa `ALLOWED_GOOGLE_EMAILS` con correos separados por coma. Ejemplo: `ALLOWED_GOOGLE_EMAILS=persona@gmail.com,otra@gmail.com`. Si queda vacio, cualquier usuario autenticado con Google puede usar la app.

## Comandos

```bash
npm install
npm run dev
npm run typecheck
npm run build
```

## Despliegue en Vercel

1. Sube el proyecto a GitHub.
2. Importa el repositorio en Vercel.
3. Agrega las mismas variables de entorno de `.env.example`.
4. En Vercel usa `FIREBASE_SERVICE_ACCOUNT_JSON`, no subas `serviceAccountKey.json`.
5. Despliega con el plan Hobby.
6. Copia el dominio generado por Vercel y agregalo en Firebase Console > Authentication > Settings > Authorized domains.

No se usan Cloud Functions, Phone Auth ni extensiones de Firebase para mantener la primera version dentro de servicios gratuitos.

Variables que debes crear en Vercel:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
NEXT_PUBLIC_FIREBASE_PROJECT_ID
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
NEXT_PUBLIC_FIREBASE_APP_ID
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
FIREBASE_SERVICE_ACCOUNT_JSON
ALLOWED_GOOGLE_EMAILS
```

`ALLOWED_GOOGLE_EMAILS` puede quedar vacia si quieres permitir cualquier Google autenticado, o tener uno o mas correos separados por coma.

## Reglas de Firestore

El archivo `firestore.rules` niega toda lectura y escritura directa desde cliente. La app funciona porque las API Routes usan Firebase Admin SDK en servidor y validan el ID token del usuario.

## Modelo de datos

- `users/{uid}`: perfil minimo del usuario autenticado.
- `groups/{groupId}`: nombre, `ownerId`, timestamps.
- `groups/{groupId}/members/{memberId}`: nombre, estado activo, timestamps.
- `groups/{groupId}/sessions/{yyyy-mm-dd}`: fecha y mapa de asistencia por integrante.

## Pruebas manuales recomendadas

- Iniciar sesion con Google.
- Crear, renombrar y eliminar un grupo.
- Agregar, renombrar y desactivar integrantes.
- Guardar asistencia para una fecha y volver a editar esa misma fecha.
- Revisar resumen con cero, una y varias fechas.
- Confirmar que las rutas API respondan error sin token.
