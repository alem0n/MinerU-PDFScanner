import { ModelVersion, OlderModelVersion } from '@/shared/types'

export function mapModelVersion(version: string): ModelVersion {
  if (!version) return ModelVersion.UNKNOWN
  if (version.startsWith('html')) return ModelVersion.HTML
  if (version.startsWith('office')) return ModelVersion.OFFICE
  if (version.startsWith('vlm')) return ModelVersion.V2
  if (version.startsWith('pipeline')) return ModelVersion.V1
  if (version === OlderModelVersion.V1) return ModelVersion.V1
  if (version === OlderModelVersion.V2) return ModelVersion.V2
  return ModelVersion.UNKNOWN
}

export function getModelVersionLabel(version: string): string {
  const v = mapModelVersion(version)
  const labels: Record<ModelVersion, string> = {
    [ModelVersion.V2]: 'VLM',
    [ModelVersion.V1]: 'Pipeline',
    [ModelVersion.HTML]: 'HTML',
    [ModelVersion.OFFICE]: 'Office',
    [ModelVersion.UNKNOWN]: version || 'Unknown',
  }
  return labels[v]
}

export function isLatestVLM(version: string): boolean {
  return version.startsWith('vlm')
}

export function isOfficeFormat(version: string): boolean {
  return version.startsWith('office') || mapModelVersion(version) === ModelVersion.OFFICE
}
