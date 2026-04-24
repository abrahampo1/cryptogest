export interface EmpresaInfo {
  id: string
  nombre: string
  dataPath: string | null
  creadaEn: string
  tipo?: 'local' | 'cloud'
  cloudConfig?: {
    empresaId: number
    userId: number
    role: string
    salt: string
    verificationHash: string
  }
}

export interface CloudSession {
  serverUrl: string
  token: string
  user: { id: number; name: string; email: string }
}

export interface CloudEmpresaInfo {
  id: number
  nombre_encrypted: string
  salt: string
  verification_hash: string
  role: string
  created_at: string
  updated_at: string
}

export interface VolumeInfo {
  name: string
  path: string
  available: boolean
}

export interface Release {
  tag: string
  name: string
  body: string
  date: string
  prerelease: boolean
}

export type CreationStep = "name" | "location"
export type LocationMode = "default" | "volume" | "custom" | "cloud"
