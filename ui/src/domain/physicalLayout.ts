import type { TopologySettings } from './topologyTypes'

export type PhysicalLocationType =
  | 'intercity'
  | 'city'
  | 'building'
  | 'wiring_closet'

export type PhysicalObjectType =
  | 'rack'
  | 'desk'
  | 'cabinet'
  | 'cable_pegboard'
  | 'inventory_shelf'
  | 'industrial_control_panel'

export type PhysicalPoint = {
  x: number
  y: number
}

export type PhysicalMapImage = {
  dataUrl: string
  fileName: string
  mediaType: 'image/png' | 'image/jpeg'
}

export type PhysicalLocation = {
  id: string
  name: string
  type: PhysicalLocationType
  parentId: string | null
  position: PhysicalPoint
  color: string
  mapImage?: PhysicalMapImage
}

export type PhysicalObject = {
  id: string
  name: string
  type: PhysicalObjectType
  locationId: string
  position: PhysicalPoint
  width: number
  height: number
}

export type PhysicalLayout = {
  activeLocationId: string
  locations: PhysicalLocation[]
  objects: PhysicalObject[]
}

export const physicalLocationLabels: Record<PhysicalLocationType, string> = {
  intercity: 'Interurbano',
  city: 'Ciudad',
  building: 'Edificio',
  wiring_closet: 'Cuarto de cableado',
}

export const physicalObjectLabels: Record<PhysicalObjectType, string> = {
  rack: 'Rack',
  desk: 'Mesa',
  cabinet: 'Armario',
  cable_pegboard: 'Panel de cableado',
  inventory_shelf: 'Estantería de inventario',
  industrial_control_panel: 'Panel de control industrial',
}

const physicalLocationColors: Record<PhysicalLocationType, string> = {
  intercity: '#1f5f99',
  city: '#237a8a',
  building: '#b87416',
  wiring_closet: '#52606c',
}

export function createDefaultPhysicalLayout(
  settings?: Pick<TopologySettings, 'siteName' | 'roomName' | 'rackName'>,
): PhysicalLayout {
  const siteName = normalizePhysicalName(settings?.siteName, 'Planta agua Albacete')
  const roomName = normalizePhysicalName(settings?.roomName, 'Cuarto de cableado principal')
  const rackName = normalizePhysicalName(settings?.rackName, 'Rack Red 01')

  return {
    activeLocationId: 'intercity-root',
    locations: [
      {
        id: 'intercity-root',
        name: 'Mapa interurbano',
        parentId: null,
        position: { x: 50, y: 50 },
        type: 'intercity',
        color: physicalLocationColors.intercity,
      },
      {
        id: 'city-albacete',
        name: siteName,
        parentId: 'intercity-root',
        position: { x: 36, y: 58 },
        type: 'city',
        color: physicalLocationColors.city,
      },
      {
        id: 'city-madrid',
        name: 'Oficinas Madrid',
        parentId: 'intercity-root',
        position: { x: 68, y: 34 },
        type: 'city',
        color: '#2f6fa3',
      },
      {
        id: 'city-valencia',
        name: 'Centro logístico Valencia',
        parentId: 'intercity-root',
        position: { x: 79, y: 67 },
        type: 'city',
        color: '#51718d',
      },
      {
        id: 'building-water-process',
        name: 'Planta de proceso',
        parentId: 'city-albacete',
        position: { x: 32, y: 42 },
        type: 'building',
        color: physicalLocationColors.building,
      },
      {
        id: 'building-control',
        name: 'Edificio de control',
        parentId: 'city-albacete',
        position: { x: 64, y: 48 },
        type: 'building',
        color: '#9a5a19',
      },
      {
        id: 'building-substation',
        name: 'Subestación eléctrica',
        parentId: 'city-albacete',
        position: { x: 44, y: 72 },
        type: 'building',
        color: '#a15c34',
      },
      {
        id: 'building-corporate',
        name: 'Oficina corporativa',
        parentId: 'city-madrid',
        position: { x: 50, y: 45 },
        type: 'building',
        color: '#6f7782',
      },
      {
        id: 'building-logistics',
        name: 'Nave logística',
        parentId: 'city-valencia',
        position: { x: 48, y: 54 },
        type: 'building',
        color: '#6b7c8c',
      },
      {
        id: 'closet-main',
        name: roomName,
        parentId: 'building-control',
        position: { x: 42, y: 46 },
        type: 'wiring_closet',
        color: physicalLocationColors.wiring_closet,
      },
    ],
    objects: [
      {
        id: 'object-rack-main',
        name: rackName,
        type: 'rack',
        locationId: 'closet-main',
        position: { x: 28, y: 48 },
        width: 10,
        height: 24,
      },
      {
        id: 'object-cable-pegboard-main',
        name: 'Panel cobre/fibra',
        type: 'cable_pegboard',
        locationId: 'closet-main',
        position: { x: 54, y: 38 },
        width: 18,
        height: 12,
      },
      {
        id: 'object-cabinet-main',
        name: 'Armario PLC línea A',
        type: 'cabinet',
        locationId: 'closet-main',
        position: { x: 74, y: 58 },
        width: 14,
        height: 18,
      },
      {
        id: 'object-desk-main',
        name: 'Mesa ingeniería',
        type: 'desk',
        locationId: 'building-control',
        position: { x: 30, y: 66 },
        width: 20,
        height: 11,
      },
      {
        id: 'object-shelf-main',
        name: 'Estantería repuestos',
        type: 'inventory_shelf',
        locationId: 'building-control',
        position: { x: 78, y: 30 },
        width: 16,
        height: 12,
      },
      {
        id: 'object-control-panel-main',
        name: 'Panel control industrial',
        type: 'industrial_control_panel',
        locationId: 'building-control',
        position: { x: 60, y: 66 },
        width: 16,
        height: 14,
      },
    ],
  }
}

export function clonePhysicalLayout(layout: PhysicalLayout): PhysicalLayout {
  return {
    activeLocationId: layout.activeLocationId,
    locations: layout.locations.map((location) => ({
      ...location,
      mapImage: location.mapImage ? { ...location.mapImage } : undefined,
      position: { ...location.position },
    })),
    objects: layout.objects.map((object) => ({
      ...object,
      position: { ...object.position },
    })),
  }
}

export function coercePhysicalLayout(
  rawLayout: unknown,
  settings?: Pick<TopologySettings, 'siteName' | 'roomName' | 'rackName'>,
): PhysicalLayout {
  const fallback = createDefaultPhysicalLayout(settings)
  if (!isRecord(rawLayout)) {
    return fallback
  }

  const locations = Array.isArray(rawLayout.locations)
    ? rawLayout.locations.flatMap((candidate) => coercePhysicalLocation(candidate))
    : []
  if (locations.length === 0 || !locations.some((location) => location.parentId === null)) {
    return fallback
  }

  const locationIds = new Set(locations.map((location) => location.id))
  const activeLocationId =
    typeof rawLayout.activeLocationId === 'string' &&
    locationIds.has(rawLayout.activeLocationId)
      ? rawLayout.activeLocationId
      : (locations.find((location) => location.parentId === null)?.id ?? locations[0].id)

  return {
    activeLocationId,
    locations,
    objects: Array.isArray(rawLayout.objects)
      ? rawLayout.objects.flatMap((candidate) =>
          coercePhysicalObject(candidate, locationIds),
        )
      : [],
  }
}

export function getPhysicalLocation(
  layout: PhysicalLayout,
  locationId: string,
): PhysicalLocation | null {
  return layout.locations.find((location) => location.id === locationId) ?? null
}

export function getActivePhysicalLocation(layout: PhysicalLayout): PhysicalLocation {
  return (
    getPhysicalLocation(layout, layout.activeLocationId) ??
    layout.locations.find((location) => location.parentId === null) ??
    layout.locations[0]
  )
}

export function movePhysicalLocationInLayout(
  layout: PhysicalLayout,
  locationId: string,
  position: PhysicalPoint,
): PhysicalLayout {
  return {
    ...clonePhysicalLayout(layout),
    locations: layout.locations.map((location) =>
      location.id === locationId
        ? { ...location, position: normalizePhysicalPoint(position) }
        : location,
    ),
  }
}

export function movePhysicalObjectInLayout(
  layout: PhysicalLayout,
  objectId: string,
  position: PhysicalPoint,
): PhysicalLayout {
  return {
    ...clonePhysicalLayout(layout),
    objects: layout.objects.map((object) =>
      object.id === objectId
        ? { ...object, position: normalizePhysicalPoint(position) }
        : object,
    ),
  }
}

export function setPhysicalLocationMapInLayout(
  layout: PhysicalLayout,
  locationId: string,
  mapImage: PhysicalMapImage,
): PhysicalLayout {
  return {
    ...clonePhysicalLayout(layout),
    locations: layout.locations.map((location) =>
      location.id === locationId ? { ...location, mapImage } : location,
    ),
  }
}

export function getPhysicalLocationChildren(
  layout: PhysicalLayout,
  parentId: string,
): PhysicalLocation[] {
  return layout.locations.filter((location) => location.parentId === parentId)
}

export function getPhysicalObjectsForLocation(
  layout: PhysicalLayout,
  locationId: string,
): PhysicalObject[] {
  return layout.objects.filter((object) => object.locationId === locationId)
}

export function getPhysicalBreadcrumb(
  layout: PhysicalLayout,
  locationId: string,
): PhysicalLocation[] {
  const byId = new Map(layout.locations.map((location) => [location.id, location]))
  const path: PhysicalLocation[] = []
  let current = byId.get(locationId)
  while (current !== undefined) {
    path.unshift(current)
    current = current.parentId === null ? undefined : byId.get(current.parentId)
  }
  return path
}

export function addPhysicalLocationToLayout(
  layout: PhysicalLayout,
  type: Exclude<PhysicalLocationType, 'intercity'>,
): { layout: PhysicalLayout; locationId: string } | null {
  const parentId = getParentForNewLocation(layout, type)
  if (parentId === null) {
    return null
  }
  const siblingCount = layout.locations.filter(
    (location) => location.parentId === parentId && location.type === type,
  ).length
  const locationId = `location-${type}-${Date.now()}`
  const location: PhysicalLocation = {
    id: locationId,
    name: `${physicalLocationLabels[type]} ${siblingCount + 1}`,
    type,
    parentId,
    color: physicalLocationColors[type],
    position: createNextPhysicalPosition(siblingCount),
  }

  return {
    locationId,
    layout: {
      ...clonePhysicalLayout(layout),
      locations: [...layout.locations, location],
    },
  }
}

export function addPhysicalObjectToLayout(
  layout: PhysicalLayout,
  type: PhysicalObjectType,
): { layout: PhysicalLayout; objectId: string } | null {
  const activeLocation = getActivePhysicalLocation(layout)
  if (
    activeLocation.type !== 'building' &&
    activeLocation.type !== 'wiring_closet'
  ) {
    return null
  }
  const siblingCount = layout.objects.filter(
    (object) => object.locationId === activeLocation.id && object.type === type,
  ).length
  const objectId = `object-${type}-${Date.now()}`
  const object: PhysicalObject = {
    id: objectId,
    name: `${physicalObjectLabels[type]} ${siblingCount + 1}`,
    type,
    locationId: activeLocation.id,
    position: createNextPhysicalPosition(layout.objects.length + siblingCount),
    width: type === 'rack' ? 10 : type === 'desk' ? 18 : 16,
    height: type === 'rack' ? 24 : type === 'desk' ? 10 : 14,
  }

  return {
    objectId,
    layout: {
      ...clonePhysicalLayout(layout),
      objects: [...layout.objects, object],
    },
  }
}

export function renamePhysicalItem(
  layout: PhysicalLayout,
  selectedId: string,
  name: string,
): PhysicalLayout {
  const normalizedName = normalizePhysicalName(name, 'Sin nombre')
  return {
    ...clonePhysicalLayout(layout),
    locations: layout.locations.map((location) =>
      location.id === selectedId ? { ...location, name: normalizedName } : location,
    ),
    objects: layout.objects.map((object) =>
      object.id === selectedId ? { ...object, name: normalizedName } : object,
    ),
  }
}

export function removePhysicalItem(
  layout: PhysicalLayout,
  selectedId: string,
): PhysicalLayout {
  const selectedLocation = getPhysicalLocation(layout, selectedId)
  if (selectedLocation !== null && selectedLocation.parentId === null) {
    return clonePhysicalLayout(layout)
  }

  if (selectedLocation !== null) {
    const removedLocationIds = collectLocationDescendants(layout, selectedId)
    const activeLocationId = removedLocationIds.has(layout.activeLocationId)
      ? (selectedLocation.parentId ?? layout.activeLocationId)
      : layout.activeLocationId

    return {
      activeLocationId,
      locations: layout.locations.filter(
        (location) => !removedLocationIds.has(location.id),
      ),
      objects: layout.objects.filter(
        (object) => !removedLocationIds.has(object.locationId),
      ),
    }
  }

  return {
    ...clonePhysicalLayout(layout),
    objects: layout.objects.filter((object) => object.id !== selectedId),
  }
}

function getParentForNewLocation(
  layout: PhysicalLayout,
  type: Exclude<PhysicalLocationType, 'intercity'>,
): string | null {
  if (type === 'city') {
    return layout.locations.find((location) => location.parentId === null)?.id ?? null
  }

  const activeLocation = getActivePhysicalLocation(layout)
  if (type === 'building') {
    return activeLocation.type === 'city' ? activeLocation.id : null
  }
  if (type === 'wiring_closet') {
    return activeLocation.type === 'building' ? activeLocation.id : null
  }
  return null
}

function collectLocationDescendants(
  layout: PhysicalLayout,
  locationId: string,
): Set<string> {
  const removed = new Set([locationId])
  let changed = true
  while (changed) {
    changed = false
    for (const location of layout.locations) {
      if (location.parentId !== null && removed.has(location.parentId) && !removed.has(location.id)) {
        removed.add(location.id)
        changed = true
      }
    }
  }
  return removed
}

function createNextPhysicalPosition(index: number): PhysicalPoint {
  const column = index % 3
  const row = Math.floor(index / 3) % 3
  return {
    x: 24 + column * 24 + row * 4,
    y: 28 + row * 22 + column * 5,
  }
}

function coercePhysicalLocation(candidate: unknown): PhysicalLocation[] {
  if (!isRecord(candidate)) {
    return []
  }
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    !isPhysicalLocationType(candidate.type)
  ) {
    return []
  }
  const parentId = candidate.parentId === null || typeof candidate.parentId === 'string'
    ? candidate.parentId
    : null
  return [
    {
      id: candidate.id,
      name: normalizePhysicalName(candidate.name, physicalLocationLabels[candidate.type]),
      type: candidate.type,
      parentId,
      position: coercePoint(candidate.position),
      color:
        typeof candidate.color === 'string'
          ? candidate.color
          : physicalLocationColors[candidate.type],
      mapImage: coercePhysicalMapImage(candidate.mapImage),
    },
  ]
}

function coercePhysicalMapImage(value: unknown): PhysicalMapImage | undefined {
  if (!isRecord(value)) {
    return undefined
  }
  if (
    typeof value.dataUrl !== 'string' ||
    typeof value.fileName !== 'string' ||
    !isPhysicalMapMediaType(value.mediaType)
  ) {
    return undefined
  }
  if (!value.dataUrl.startsWith(`data:${value.mediaType};base64,`)) {
    return undefined
  }
  return {
    dataUrl: value.dataUrl,
    fileName: normalizePhysicalName(value.fileName, 'mapa'),
    mediaType: value.mediaType,
  }
}

function coercePhysicalObject(
  candidate: unknown,
  locationIds: Set<string>,
): PhysicalObject[] {
  if (!isRecord(candidate)) {
    return []
  }
  if (
    typeof candidate.id !== 'string' ||
    typeof candidate.name !== 'string' ||
    typeof candidate.locationId !== 'string' ||
    !locationIds.has(candidate.locationId) ||
    !isPhysicalObjectType(candidate.type)
  ) {
    return []
  }
  return [
    {
      id: candidate.id,
      name: normalizePhysicalName(candidate.name, physicalObjectLabels[candidate.type]),
      type: candidate.type,
      locationId: candidate.locationId,
      position: coercePoint(candidate.position),
      width: coerceSize(candidate.width, 16),
      height: coerceSize(candidate.height, 14),
    },
  ]
}

function coercePoint(value: unknown): PhysicalPoint {
  if (!isRecord(value)) {
    return { x: 40, y: 40 }
  }
  return normalizePhysicalPoint({
    x: typeof value.x === 'number' ? value.x : 40,
    y: typeof value.y === 'number' ? value.y : 40,
  })
}

function normalizePhysicalPoint(position: PhysicalPoint): PhysicalPoint {
  return {
    x: clampPercent(position.x),
    y: clampPercent(position.y),
  }
}

function coerceSize(value: unknown, fallback: number): number {
  return clampPercent(typeof value === 'number' ? value : fallback)
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 40
  }
  return Math.max(4, Math.min(92, Math.round(value)))
}

function normalizePhysicalName(value: string | undefined, fallback: string): string {
  const normalized = value?.trim()
  return normalized ? normalized.slice(0, 80) : fallback
}

function isPhysicalLocationType(value: unknown): value is PhysicalLocationType {
  return (
    value === 'intercity' ||
    value === 'city' ||
    value === 'building' ||
    value === 'wiring_closet'
  )
}

function isPhysicalObjectType(value: unknown): value is PhysicalObjectType {
  return (
    value === 'rack' ||
    value === 'desk' ||
    value === 'cabinet' ||
    value === 'cable_pegboard' ||
    value === 'inventory_shelf' ||
    value === 'industrial_control_panel'
  )
}

function isPhysicalMapMediaType(value: unknown): value is PhysicalMapImage['mediaType'] {
  return value === 'image/png' || value === 'image/jpeg'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
