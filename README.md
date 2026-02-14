<div align="center">

<img src="assets/logo.png" alt="CryptoGest" width="120" />

# CryptoGest

**ERP de Gestión Contable y Financiera**

Software de escritorio para la gestión integral de contabilidad, facturación y fiscalidad.
Cifrado de extremo a extremo. Tus datos nunca salen de tu equipo sin tu autorización.

[![Version](https://img.shields.io/badge/version-1.0.0-0d6efd?style=flat-square)](https://github.com/tu-usuario/cryptogest/releases)
[![Plataformas](https://img.shields.io/badge/plataformas-Windows%20%7C%20macOS%20%7C%20Linux-333?style=flat-square)](#instalación)
[![Cifrado](https://img.shields.io/badge/cifrado-AES--256--GCM-2ea043?style=flat-square)](#seguridad)
[![Licencia](https://img.shields.io/badge/licencia-Source%20Available-888?style=flat-square)](LICENSE)

---

[Características](#características) &#8226; [Seguridad](#seguridad) &#8226; [Instalación](#instalación) &#8226; [Stack Tecnológico](#stack-tecnológico) &#8226; [Desarrollo](#desarrollo) &#8226; [Licencia](#licencia)

</div>

<br/>

## Por qué CryptoGest

CryptoGest nace de una premisa clara: **la información financiera de tu empresa debe ser privada, segura y estar bajo tu control**. A diferencia de soluciones en la nube donde tus datos residen en servidores de terceros, CryptoGest almacena todo localmente en tu equipo con cifrado de grado militar.

- **Privacidad por diseño** -- Tus datos financieros nunca abandonan tu dispositivo sin autorización explícita.
- **Sin suscripciones obligatorias** -- Software de escritorio que funciona sin conexión a internet.
- **Cumplimiento fiscal español** -- Modelos 303, 111 y 390 integrados. Plan General de Contabilidad (PGC).
- **Multi-empresa** -- Gestiona múltiples negocios desde una sola instalación con aislamiento total de datos.

<br/>

## Características

### Gestión Financiera Completa

| Módulo | Descripción |
|--------|-------------|
| **Dashboard** | Visión general con KPIs en tiempo real: clientes activos, ingresos, facturas pendientes, gastos y balance neto. |
| **Facturación** | Ciclo completo de facturas: borrador, emitida, pagada, vencida y anulada. Líneas con impuestos y retenciones automáticas. |
| **Gastos** | Registro de gastos con categorías, adjuntos cifrados y soporte para importación masiva desde CSV. |
| **Clientes** | Base de datos de clientes con NIF, datos de contacto, historial de actividad y estado. |
| **Productos y Servicios** | Catálogo con precios base, configuración fiscal (IVA, IRPF, RE) y estado activo/inactivo. |

### Contabilidad y Fiscalidad

| Módulo | Descripción |
|--------|-------------|
| **Asientos Contables** | Partida doble con generación automática desde facturas y gastos. Validación de cuadre debe/haber. |
| **Plan de Cuentas** | Estructura jerárquica basada en el PGC con cuentas del sistema y cuentas personalizables. |
| **Ejercicios Fiscales** | Gestión de períodos fiscales con apertura, cierre y estadísticas por ejercicio. |
| **Libro Mayor** | Consulta de movimientos por cuenta contable con saldos acumulados. |
| **Modelo 303** | Liquidación trimestral de IVA con desglose de IVA devengado y deducible. |
| **Modelo 111** | Declaración trimestral de retenciones e ingresos a cuenta del IRPF. |
| **Modelo 390** | Resumen anual de IVA con conciliación completa del ejercicio. |

### Multi-Empresa

- Crea y gestiona **múltiples empresas** de forma independiente.
- Cada empresa dispone de su **propia base de datos**, credenciales y directorio de archivos.
- Almacenamiento en **rutas personalizadas**: unidades USB, discos de red o cualquier ubicación.
- Cambio rápido entre empresas desde el selector integrado.

### Respaldos y Exportación

- **Backup local** comprimido con un clic.
- **Backup en la nube** cifrado con seguimiento de progreso y gestión de cuota.
- **Exportación a Excel** de facturas, gastos y datos financieros.
- **Importación CSV** para carga masiva de gastos.
- Restauración completa desde archivos de respaldo.

<br/>

## Seguridad

La seguridad no es una función adicional en CryptoGest; es el fundamento sobre el que se construye toda la aplicación.

### Cifrado de Datos

| Componente | Especificación |
|------------|----------------|
| **Algoritmo** | AES-256-GCM (cifrado autenticado) |
| **Derivación de clave** | PBKDF2 con 100,000 iteraciones |
| **Salt** | 256 bits (32 bytes), único por empresa |
| **Vector de inicialización** | 128 bits (16 bytes), único por operación |
| **Tag de autenticación** | 128 bits (16 bytes) |

### Autenticación

- **Contraseña maestra** con requisitos mínimos de seguridad.
- **PIN numérico** (4-8 dígitos) como método alternativo.
- **Passkeys biométricos** -- Windows Hello, Touch ID o autenticación del sistema.
- **Bloqueo automático** de sesión por inactividad.

### Arquitectura Segura

- **Aislamiento de procesos**: el proceso de renderizado no tiene acceso directo al sistema de archivos ni a Node.js.
- **API de lista blanca**: solo las operaciones explícitamente definidas en el puente IPC están disponibles.
- **Adjuntos cifrados**: los archivos adjuntos se almacenan con nombres aleatorios y cifrado AES-256-GCM.
- **Credenciales protegidas**: las passkeys se almacenan mediante `Electron safeStorage`, vinculado al sistema operativo.
- **Base de datos local**: SQLite embebido, sin servidores externos obligatorios.

<br/>

## Instalación

### Requisitos del sistema

- **Windows** 10/11 (x64)
- **macOS** 12 Monterey o superior
- **Linux** distribuciones basadas en Debian/Ubuntu, Fedora o Arch

### Descargar

Descarga la última versión desde la [página de Releases](https://github.com/tu-usuario/cryptogest/releases):

| Plataforma | Formato |
|------------|---------|
| Windows | `.exe` (instalador) |
| macOS | `.dmg` |
| Linux | `.AppImage` |

### Primer inicio

1. Ejecuta el instalador correspondiente a tu sistema operativo.
2. Al abrir la aplicación, el **asistente de configuración** te guiará para crear tu primera empresa.
3. Establece tu contraseña maestra o PIN.
4. Comienza a gestionar tu contabilidad.

<br/>

## Stack Tecnológico

| Capa | Tecnologías |
|------|-------------|
| **Aplicación** | [Electron](https://www.electronjs.org/) 27 |
| **Frontend** | [React](https://react.dev/) 18, [TypeScript](https://www.typescriptlang.org/) 5.3 |
| **Estilos** | [Tailwind CSS](https://tailwindcss.com/) 3.4, [Radix UI](https://www.radix-ui.com/) |
| **Base de datos** | [SQLite](https://www.sqlite.org/) con [Prisma](https://www.prisma.io/) ORM 5.7 |
| **Criptografía** | Node.js Crypto (AES-256-GCM, PBKDF2) |
| **Build** | [Vite](https://vitejs.dev/) 5, [Electron Builder](https://www.electron.build/) |

<br/>

## Desarrollo

### Requisitos previos

- [Node.js](https://nodejs.org/) >= 18
- [npm](https://www.npmjs.com/) >= 9

### Configuración del entorno

```bash
# Clonar el repositorio
git clone https://github.com/tu-usuario/cryptogest.git
cd cryptogest

# Instalar dependencias
npm install

# Generar el cliente de Prisma
npm run prisma:generate

# Ejecutar migraciones de base de datos
npm run prisma:migrate

# Iniciar en modo desarrollo
npm run dev
```

### Scripts disponibles

| Comando | Descripción |
|---------|-------------|
| `npm run dev` | Inicia la aplicación en modo desarrollo con recarga en caliente. |
| `npm run build` | Compila y empaqueta la aplicación para todas las plataformas. |
| `npm run build:win` | Genera el instalador para Windows. |
| `npm run build:mac` | Genera el instalador para macOS. |
| `npm run build:linux` | Genera el instalador para Linux. |
| `npm run prisma:studio` | Abre Prisma Studio para inspección visual de la base de datos. |

### Estructura del proyecto

```
cryptogest/
├── src/                    # Frontend (React + TypeScript)
│   ├── pages/              # Páginas de la aplicación
│   ├── components/         # Componentes reutilizables
│   │   ├── layout/         # Layout principal y sidebar
│   │   └── ui/             # Componentes de interfaz (shadcn/ui)
│   └── lib/                # Utilidades
├── electron/               # Proceso principal de Electron
│   ├── main.ts             # Lógica del servidor, IPC handlers
│   ├── preload.ts          # Puente seguro renderer ↔ main
│   ├── crypto.ts           # Cifrado y gestión multi-empresa
│   └── cloud.ts            # Integración con servicio de backup en la nube
├── prisma/                 # Esquema y migraciones de base de datos
│   └── schema.prisma       # 14 modelos de datos
└── assets/                 # Recursos estáticos
```

<br/>

## Licencia

Este proyecto se distribuye bajo la licencia **CryptoGest Source Available License**.

Puedes ver, estudiar, modificar y redistribuir el código fuente para **uso no comercial**. Cualquier uso comercial requiere autorización previa por escrito del titular de los derechos.

Consulta el archivo [LICENSE](LICENSE) para los términos completos.

Para licencias comerciales, contacta a: **abraham@leiro.dev**

---

<div align="center">

**CryptoGest** -- Gestión contable segura y profesional.

Copyright &copy; 2026 Abraham Leiro / [leiro.dev](mailto:abraham@leiro.dev). Todos los derechos reservados.

</div>
