import {
  useId,
  useRef,
  type CSSProperties,
  type ChangeEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import {
  Box,
  Cable,
  ChevronLeft,
  ChevronRight,
  Database,
  Factory,
  Image as ImageIcon,
  ImagePlus,
  MapPin,
  Plus,
  Square,
  Trash2,
} from 'lucide-react'

import {
  getActivePhysicalLocation,
  getPhysicalBreadcrumb,
  getPhysicalLocation,
  getPhysicalLocationChildren,
  getPhysicalObjectsForLocation,
  physicalLocationLabels,
  physicalObjectLabels,
  type PhysicalLayout,
  type PhysicalLocation,
  type PhysicalLocationType,
  type PhysicalPoint,
  type PhysicalObject,
  type PhysicalObjectType,
} from '../domain/physicalLayout'

type PhysicalWorkspaceProps = {
  layout: PhysicalLayout
  selectedId: string | null
  onBeginMove: () => void
  onMoveLocation: (locationId: string, position: PhysicalPoint) => void
  onMoveObject: (objectId: string, position: PhysicalPoint) => void
  onNavigate: (locationId: string) => void
  onSelect: (selectedId: string) => void
}

type PhysicalToolsPanelProps = {
  layout: PhysicalLayout
  onAddLocation: (type: Exclude<PhysicalLocationType, 'intercity'>) => void
  onAddObject: (type: PhysicalObjectType) => void
}

type PhysicalInventoryPanelProps = {
  layout: PhysicalLayout
  selectedId: string | null
  onDeleteSelected: () => void
  onNavigate: (locationId: string) => void
  onRenameSelected: (name: string) => void
  onSelect: (selectedId: string) => void
  onUploadLocationMap: (file: File) => void
}

type DragTarget = {
  id: string
  kind: 'location' | 'object'
  startX: number
  startY: number
  moved: boolean
}

const physicalObjectTypes: PhysicalObjectType[] = [
  'rack',
  'desk',
  'cabinet',
  'cable_pegboard',
  'inventory_shelf',
  'industrial_control_panel',
]

export function PhysicalWorkspace({
  layout,
  selectedId,
  onBeginMove,
  onMoveLocation,
  onMoveObject,
  onNavigate,
  onSelect,
}: PhysicalWorkspaceProps) {
  const dragTarget = useRef<DragTarget | null>(null)
  const mapRef = useRef<HTMLDivElement | null>(null)
  const activeLocation = getActivePhysicalLocation(layout)
  const childLocations = getPhysicalLocationChildren(layout, activeLocation.id)
  const objects = getPhysicalObjectsForLocation(layout, activeLocation.id)
  const breadcrumb = getPhysicalBreadcrumb(layout, activeLocation.id)
  const parentLocation =
    activeLocation.parentId === null
      ? null
      : getPhysicalLocation(layout, activeLocation.parentId)

  return (
    <div className="physical-workspace" data-level={activeLocation.type}>
      <div className="physical-workspace__header">
        <div className="physical-breadcrumb" aria-label="Ruta física">
          {breadcrumb.map((location, index) => (
            <button
              className="physical-breadcrumb__item"
              key={location.id}
              onClick={() => onNavigate(location.id)}
              type="button"
            >
              {index > 0 ? <ChevronRight size={12} /> : null}
              <span>{location.name}</span>
            </button>
          ))}
        </div>
        <div className="physical-workspace__scope">
          <strong>{activeLocation.name}</strong>
          <span>{physicalLocationLabels[activeLocation.type]}</span>
        </div>
      </div>

      <div className="physical-map-stage">
        <div
          className="physical-map-grid"
          aria-label={`Mapa físico ${activeLocation.name}`}
          ref={mapRef}
        >
          {activeLocation.mapImage ? (
            <img
              alt={`Mapa físico de ${activeLocation.name}`}
              className="physical-map-image"
              draggable={false}
              src={activeLocation.mapImage.dataUrl}
            />
          ) : (
            <div className="physical-map-placeholder">
              <ImageIcon size={28} />
              <strong>Sin mapa cargado</strong>
              <span>Selecciona esta localización y añade un mapa PNG o JPG desde el panel derecho.</span>
            </div>
          )}
          {parentLocation ? (
            <button
              className="physical-back-button"
              onClick={() => onNavigate(parentLocation.id)}
              type="button"
            >
              <ChevronLeft size={15} />
              {parentLocation.name}
            </button>
          ) : null}

          {childLocations.map((location) => (
            <LocationMarker
              key={location.id}
              location={location}
              selected={selectedId === location.id}
              onPointerDown={(event) =>
                startDrag(event, {
                  id: location.id,
                  kind: 'location',
                })
              }
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
            />
          ))}
          {objects.map((object) => (
            <PhysicalObjectMarker
              key={object.id}
              object={object}
              selected={selectedId === object.id}
              onPointerDown={(event) =>
                startDrag(event, {
                  id: object.id,
                  kind: 'object',
                })
              }
              onPointerMove={moveDrag}
              onPointerUp={finishDrag}
            />
          ))}

          {activeLocation.mapImage && childLocations.length === 0 && objects.length === 0 ? (
            <div className="physical-empty-map">
              <Factory size={22} />
              <strong>Mapa vacío</strong>
              <span>Añade edificios, cuartos de cableado o equipamiento físico desde la barra lateral.</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )

  function startDrag(
    event: ReactPointerEvent<HTMLButtonElement>,
    target: Pick<DragTarget, 'id' | 'kind'>,
  ) {
    if (event.button !== 0) {
      return
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId)
    } catch {
      // Algunos eventos sintéticos no tienen puntero activo en el navegador.
    }
    dragTarget.current = {
      ...target,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
    }
    onSelect(target.id)
    event.stopPropagation()
  }

  function moveDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragTarget.current
    if (current === null) {
      return
    }
    const distance = Math.hypot(event.clientX - current.startX, event.clientY - current.startY)
    if (!current.moved && distance > 4) {
      current.moved = true
      onBeginMove()
    }
    if (!current.moved) {
      return
    }

    const position = pointerToMapPosition(event.clientX, event.clientY, mapRef.current)
    if (position === null) {
      return
    }
    if (current.kind === 'location') {
      onMoveLocation(current.id, position)
    } else {
      onMoveObject(current.id, position)
    }
  }

  function finishDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    const current = dragTarget.current
    if (current === null) {
      return
    }
    if (!current.moved && current.kind === 'location') {
      onNavigate(current.id)
    }
    if (!current.moved && current.kind === 'object') {
      onSelect(current.id)
    }
    dragTarget.current = null
    event.stopPropagation()
  }
}

export function PhysicalToolsPanel({
  layout,
  onAddLocation,
  onAddObject,
}: PhysicalToolsPanelProps) {
  const activeLocation = getActivePhysicalLocation(layout)
  const canAddBuilding = activeLocation.type === 'city'
  const canAddCloset = activeLocation.type === 'building'
  const canAddObject =
    activeLocation.type === 'building' || activeLocation.type === 'wiring_closet'

  return (
    <div className="physical-tools-pane">
      <div className="devices-pane__header">
        <strong>Mapa físico</strong>
        <small>Localizaciones y planta OT/IT</small>
      </div>

      <div className="site-card">
        <div>
          <span>Localización actual</span>
          <strong>{activeLocation.name}</strong>
        </div>
        <div>
          <span>Tipo</span>
          <strong>{physicalLocationLabels[activeLocation.type]}</strong>
        </div>
      </div>

      <div className="physical-tool-section">
        <strong>Localizaciones</strong>
        <button
          className="physical-tool-button"
          onClick={() => onAddLocation('city')}
          type="button"
        >
          <Plus size={15} />
          Nueva ciudad
        </button>
        <button
          className="physical-tool-button"
          disabled={!canAddBuilding}
          onClick={() => onAddLocation('building')}
          type="button"
        >
          <Plus size={15} />
          Nuevo edificio
        </button>
        <button
          className="physical-tool-button"
          disabled={!canAddCloset}
          onClick={() => onAddLocation('wiring_closet')}
          type="button"
        >
          <Plus size={15} />
          Nuevo cuarto de cableado
        </button>
      </div>

      <div className="physical-tool-section">
        <strong>Elementos físicos</strong>
        <div className="physical-object-palette">
          {physicalObjectTypes.map((type) => (
            <button
              className="physical-object-tool"
              disabled={!canAddObject}
              key={type}
              onClick={() => onAddObject(type)}
              type="button"
            >
              <PhysicalObjectIcon type={type} />
              <span>{physicalObjectLabels[type]}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export function PhysicalInventoryPanel({
  layout,
  selectedId,
  onDeleteSelected,
  onNavigate,
  onRenameSelected,
  onSelect,
  onUploadLocationMap,
}: PhysicalInventoryPanelProps) {
  const mapInputId = useId()
  const activeLocation = getActivePhysicalLocation(layout)
  const selectedLocation =
    selectedId === null ? null : getPhysicalLocation(layout, selectedId)
  const selectedObject =
    selectedId === null
      ? null
      : layout.objects.find((object) => object.id === selectedId) ?? null
  const selectedName = selectedLocation?.name ?? selectedObject?.name ?? ''

  return (
    <>
      <details className="dock-panel physical-location-disclosure">
        <summary className="dock-panel__header physical-location-disclosure__summary">
          <strong>Localizaciones físicas</strong>
          <span>{layout.locations.length} · desplegar</span>
        </summary>
        <div className="dock-panel__body">
          <PhysicalLocationTree
            activeLocationId={activeLocation.id}
            layout={layout}
            parentId={null}
            selectedId={selectedId}
            onNavigate={onNavigate}
            onSelect={onSelect}
          />
        </div>
      </details>

      <section className="dock-panel">
        <div className="dock-panel__header">
          <strong>Inventario físico</strong>
          <span>{layout.objects.length}</span>
        </div>
        <div className="dock-panel__body">
          <div className="server-summary__list">
            <div className="server-summary__row">
              <span>Mapa activo</span>
              <strong>{activeLocation.name}</strong>
            </div>
            <div className="server-summary__row">
              <span>Tipo</span>
              <strong>{physicalLocationLabels[activeLocation.type]}</strong>
            </div>
            <div className="server-summary__row">
              <span>Elementos aquí</span>
              <strong>{getPhysicalObjectsForLocation(layout, activeLocation.id).length}</strong>
            </div>
          </div>

          {selectedName ? (
            <div className="physical-selection-editor">
              <label className="field">
                <span>Nombre seleccionado</span>
                <input
                  aria-label="Nombre seleccionado"
                  id="physical-selected-name"
                  name="physical-selected-name"
                  onChange={(event) => onRenameSelected(event.target.value)}
                  value={selectedName}
                />
              </label>
              <div className="physical-map-upload">
                <div>
                  <strong>Mapa de localización</strong>
                  <span>
                    {selectedLocation?.mapImage?.fileName ??
                      'PNG, JPG o JPEG. Un mapa por localización.'}
                  </span>
                </div>
                <input
                  accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                  aria-label="Archivo de mapa físico"
                  className="visually-hidden"
                  disabled={selectedLocation === null}
                  id={mapInputId}
                  name="physical-map-upload"
                  onChange={handleMapInputChange}
                  type="file"
                />
                <label
                  aria-disabled={selectedLocation === null}
                  className="secondary-button physical-map-upload__button"
                  htmlFor={selectedLocation === null ? undefined : mapInputId}
                >
                  <ImagePlus size={15} />
                  Añadir mapa
                </label>
              </div>
              <button
                className="danger-button"
                disabled={selectedLocation?.parentId === null}
                onClick={onDeleteSelected}
                type="button"
              >
                <Trash2 size={15} />
                Eliminar
              </button>
            </div>
          ) : (
            <div className="empty-state empty-state--compact">
              Selecciona ciudad, edificio, cuarto de cableado o elemento para editarlo.
            </div>
          )}
        </div>
      </section>
    </>
  )

  function handleMapInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file === undefined) {
      return
    }
    onUploadLocationMap(file)
  }
}

function PhysicalLocationTree({
  activeLocationId,
  layout,
  parentId,
  selectedId,
  onNavigate,
  onSelect,
}: {
  activeLocationId: string
  layout: PhysicalLayout
  parentId: string | null
  selectedId: string | null
  onNavigate: (locationId: string) => void
  onSelect: (selectedId: string) => void
}) {
  const locations = layout.locations.filter((location) => location.parentId === parentId)
  if (locations.length === 0) {
    return null
  }

  return (
    <div className="physical-tree">
      {locations.map((location) => (
        <div className="physical-tree__branch" key={location.id}>
          <button
            className="physical-tree__item"
            aria-label={`Abrir localización ${location.name}`}
            data-active={location.id === activeLocationId}
            data-selected={location.id === selectedId}
            onClick={() => {
              onSelect(location.id)
              onNavigate(location.id)
            }}
            type="button"
          >
            <MapPin size={14} />
            <span>{location.name}</span>
            <small>{physicalLocationLabels[location.type]}</small>
          </button>
          <PhysicalLocationTree
            activeLocationId={activeLocationId}
            layout={layout}
            parentId={location.id}
            selectedId={selectedId}
            onNavigate={onNavigate}
            onSelect={onSelect}
          />
        </div>
      ))}
    </div>
  )
}

function LocationMarker({
  location,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  location: PhysicalLocation
  selected: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      className="physical-location-marker"
      aria-label={`Abrir localización ${location.name}`}
      data-selected={selected}
      data-type={location.type}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={positionStyle(location.position.x, location.position.y)}
      type="button"
    >
      <span style={{ background: location.color }}>
        <MapPin size={15} />
      </span>
      <strong>{location.name}</strong>
      <small>{physicalLocationLabels[location.type]}</small>
    </button>
  )
}

function PhysicalObjectMarker({
  object,
  selected,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: {
  object: PhysicalObject
  selected: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      className="physical-object-marker"
      aria-label={`Seleccionar elemento físico ${object.name}`}
      data-selected={selected}
      data-type={object.type}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      style={{
        ...positionStyle(object.position.x, object.position.y),
        height: `${object.height}%`,
        width: `${object.width}%`,
      }}
      type="button"
    >
      <PhysicalObjectIcon type={object.type} />
      <strong>{object.name}</strong>
      <small>{physicalObjectLabels[object.type]}</small>
    </button>
  )
}

function PhysicalObjectIcon({ type }: { type: PhysicalObjectType }) {
  if (type === 'cable_pegboard') {
    return <Cable size={17} />
  }
  if (type === 'inventory_shelf') {
    return <Database size={17} />
  }
  if (type === 'desk') {
    return <Square size={17} />
  }
  if (type === 'industrial_control_panel') {
    return <Factory size={17} />
  }
  return <Box size={17} />
}

function positionStyle(x: number, y: number): CSSProperties {
  return {
    left: `${x}%`,
    top: `${y}%`,
  }
}

function pointerToMapPosition(
  clientX: number,
  clientY: number,
  mapElement: HTMLDivElement | null,
): PhysicalPoint | null {
  if (mapElement === null) {
    return null
  }
  const rect = mapElement.getBoundingClientRect()
  if (rect.width === 0 || rect.height === 0) {
    return null
  }
  return {
    x: clampPhysicalPercent(((clientX - rect.left) / rect.width) * 100),
    y: clampPhysicalPercent(((clientY - rect.top) / rect.height) * 100),
  }
}

function clampPhysicalPercent(value: number): number {
  if (!Number.isFinite(value)) {
    return 50
  }
  return Math.max(4, Math.min(92, Math.round(value)))
}
