/*
  Warnings:

  - You are about to drop the column `iva` on the `Factura` table. All the data in the column will be lost.
  - You are about to drop the column `categoria` on the `Gasto` table. All the data in the column will be lost.
  - You are about to alter the column `cantidad` on the `LineaFactura` table. The data in that column could be lost. The data in that column will be cast from `Int` to `Float`.
  - Added the required column `subtotal` to the `LineaFactura` table without a default value. This is not possible if the table is not empty.

*/
-- CreateTable
CREATE TABLE "Producto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codigo" TEXT,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'servicio',
    "precioBase" REAL NOT NULL,
    "impuestoId" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Producto_impuestoId_fkey" FOREIGN KEY ("impuestoId") REFERENCES "Impuesto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Impuesto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "porcentaje" REAL NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'IVA',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "porDefecto" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CategoriaGasto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6B7280',
    "icono" TEXT NOT NULL DEFAULT 'receipt',
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Cliente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nombre" TEXT NOT NULL,
    "email" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "codigoPostal" TEXT,
    "provincia" TEXT,
    "pais" TEXT NOT NULL DEFAULT 'España',
    "nif" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Cliente" ("createdAt", "direccion", "email", "id", "nif", "nombre", "telefono", "updatedAt") SELECT "createdAt", "direccion", "email", "id", "nif", "nombre", "telefono", "updatedAt" FROM "Cliente";
DROP TABLE "Cliente";
ALTER TABLE "new_Cliente" RENAME TO "Cliente";
CREATE UNIQUE INDEX "Cliente_nif_key" ON "Cliente"("nif");
CREATE TABLE "new_Configuracion" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "clave" TEXT NOT NULL,
    "valor" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'string',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Configuracion" ("clave", "createdAt", "id", "updatedAt", "valor") SELECT "clave", "createdAt", "id", "updatedAt", "valor" FROM "Configuracion";
DROP TABLE "Configuracion";
ALTER TABLE "new_Configuracion" RENAME TO "Configuracion";
CREATE UNIQUE INDEX "Configuracion_clave_key" ON "Configuracion"("clave");
CREATE TABLE "new_Factura" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numero" TEXT NOT NULL,
    "serie" TEXT NOT NULL DEFAULT 'F',
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fechaVencimiento" DATETIME,
    "clienteId" INTEGER NOT NULL,
    "subtotal" REAL NOT NULL,
    "totalImpuestos" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'borrador',
    "notas" TEXT,
    "formaPago" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Factura_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Factura" ("clienteId", "createdAt", "estado", "fecha", "id", "numero", "subtotal", "total", "updatedAt") SELECT "clienteId", "createdAt", "estado", "fecha", "id", "numero", "subtotal", "total", "updatedAt" FROM "Factura";
DROP TABLE "Factura";
ALTER TABLE "new_Factura" RENAME TO "Factura";
CREATE UNIQUE INDEX "Factura_numero_key" ON "Factura"("numero");
CREATE TABLE "new_Gasto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "descripcion" TEXT NOT NULL,
    "categoriaId" INTEGER,
    "monto" REAL NOT NULL,
    "impuestoIncluido" BOOLEAN NOT NULL DEFAULT true,
    "fecha" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "proveedor" TEXT,
    "numeroFactura" TEXT,
    "notas" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Gasto_categoriaId_fkey" FOREIGN KEY ("categoriaId") REFERENCES "CategoriaGasto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Gasto" ("createdAt", "descripcion", "fecha", "id", "monto", "proveedor", "updatedAt") SELECT "createdAt", "descripcion", "fecha", "id", "monto", "proveedor", "updatedAt" FROM "Gasto";
DROP TABLE "Gasto";
ALTER TABLE "new_Gasto" RENAME TO "Gasto";
CREATE TABLE "new_LineaFactura" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "facturaId" INTEGER NOT NULL,
    "productoId" INTEGER,
    "descripcion" TEXT NOT NULL,
    "cantidad" REAL NOT NULL DEFAULT 1,
    "precioUnit" REAL NOT NULL,
    "descuento" REAL NOT NULL DEFAULT 0,
    "impuestoId" INTEGER,
    "subtotal" REAL NOT NULL,
    "totalImpuesto" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL,
    CONSTRAINT "LineaFactura_facturaId_fkey" FOREIGN KEY ("facturaId") REFERENCES "Factura" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LineaFactura_productoId_fkey" FOREIGN KEY ("productoId") REFERENCES "Producto" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LineaFactura_impuestoId_fkey" FOREIGN KEY ("impuestoId") REFERENCES "Impuesto" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LineaFactura" ("cantidad", "descripcion", "facturaId", "id", "precioUnit", "total") SELECT "cantidad", "descripcion", "facturaId", "id", "precioUnit", "total" FROM "LineaFactura";
DROP TABLE "LineaFactura";
ALTER TABLE "new_LineaFactura" RENAME TO "LineaFactura";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Producto_codigo_key" ON "Producto"("codigo");

-- CreateIndex
CREATE UNIQUE INDEX "CategoriaGasto_nombre_key" ON "CategoriaGasto"("nombre");
