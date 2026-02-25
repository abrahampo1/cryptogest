import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

// ES
import esCommon from './locales/es/common.json'
import esSidebar from './locales/es/sidebar.json'
import esAuth from './locales/es/auth.json'
import esDashboard from './locales/es/dashboard.json'
import esClientes from './locales/es/clientes.json'
import esProductos from './locales/es/productos.json'
import esFacturas from './locales/es/facturas.json'
import esGastos from './locales/es/gastos.json'
import esEjercicios from './locales/es/ejercicios.json'
import esContabilidad from './locales/es/contabilidad.json'
import esModelos from './locales/es/modelos.json'
import esConfiguracion from './locales/es/configuracion.json'
import esCloud from './locales/es/cloud.json'
import esBuzon from './locales/es/buzon.json'
import esManual from './locales/es/manual.json'
import esPdf from './locales/es/pdf.json'
import esErrors from './locales/es/errors.json'

// EN
import enCommon from './locales/en/common.json'
import enSidebar from './locales/en/sidebar.json'
import enAuth from './locales/en/auth.json'
import enDashboard from './locales/en/dashboard.json'
import enClientes from './locales/en/clientes.json'
import enProductos from './locales/en/productos.json'
import enFacturas from './locales/en/facturas.json'
import enGastos from './locales/en/gastos.json'
import enEjercicios from './locales/en/ejercicios.json'
import enContabilidad from './locales/en/contabilidad.json'
import enModelos from './locales/en/modelos.json'
import enConfiguracion from './locales/en/configuracion.json'
import enCloud from './locales/en/cloud.json'
import enBuzon from './locales/en/buzon.json'
import enManual from './locales/en/manual.json'
import enPdf from './locales/en/pdf.json'
import enErrors from './locales/en/errors.json'

// FR
import frCommon from './locales/fr/common.json'
import frSidebar from './locales/fr/sidebar.json'
import frAuth from './locales/fr/auth.json'
import frDashboard from './locales/fr/dashboard.json'
import frClientes from './locales/fr/clientes.json'
import frProductos from './locales/fr/productos.json'
import frFacturas from './locales/fr/facturas.json'
import frGastos from './locales/fr/gastos.json'
import frEjercicios from './locales/fr/ejercicios.json'
import frContabilidad from './locales/fr/contabilidad.json'
import frModelos from './locales/fr/modelos.json'
import frConfiguracion from './locales/fr/configuracion.json'
import frCloud from './locales/fr/cloud.json'
import frBuzon from './locales/fr/buzon.json'
import frManual from './locales/fr/manual.json'
import frPdf from './locales/fr/pdf.json'
import frErrors from './locales/fr/errors.json'

const resources = {
  es: {
    common: esCommon,
    sidebar: esSidebar,
    auth: esAuth,
    dashboard: esDashboard,
    clientes: esClientes,
    productos: esProductos,
    facturas: esFacturas,
    gastos: esGastos,
    ejercicios: esEjercicios,
    contabilidad: esContabilidad,
    modelos: esModelos,
    configuracion: esConfiguracion,
    cloud: esCloud,
    buzon: esBuzon,
    manual: esManual,
    pdf: esPdf,
    errors: esErrors,
  },
  en: {
    common: enCommon,
    sidebar: enSidebar,
    auth: enAuth,
    dashboard: enDashboard,
    clientes: enClientes,
    productos: enProductos,
    facturas: enFacturas,
    gastos: enGastos,
    ejercicios: enEjercicios,
    contabilidad: enContabilidad,
    modelos: enModelos,
    configuracion: enConfiguracion,
    cloud: enCloud,
    buzon: enBuzon,
    manual: enManual,
    pdf: enPdf,
    errors: enErrors,
  },
  fr: {
    common: frCommon,
    sidebar: frSidebar,
    auth: frAuth,
    dashboard: frDashboard,
    clientes: frClientes,
    productos: frProductos,
    facturas: frFacturas,
    gastos: frGastos,
    ejercicios: frEjercicios,
    contabilidad: frContabilidad,
    modelos: frModelos,
    configuracion: frConfiguracion,
    cloud: frCloud,
    buzon: frBuzon,
    manual: frManual,
    pdf: frPdf,
    errors: frErrors,
  },
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'es',
    defaultNS: 'common',
    ns: [
      'common', 'sidebar', 'auth', 'dashboard', 'clientes', 'productos',
      'facturas', 'gastos', 'ejercicios', 'contabilidad', 'modelos',
      'configuracion', 'cloud', 'buzon', 'manual', 'pdf', 'errors',
    ],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage'],
      lookupLocalStorage: 'app.language',
      caches: ['localStorage'],
    },
  })

export default i18n
