-- CreateTable
CREATE TABLE "AdjuntoGasto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "gastoId" INTEGER NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "nombreEncriptado" TEXT NOT NULL,
    "tipoMime" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AdjuntoGasto_gastoId_fkey" FOREIGN KEY ("gastoId") REFERENCES "Gasto" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "AdjuntoGasto_nombreEncriptado_key" ON "AdjuntoGasto"("nombreEncriptado");
