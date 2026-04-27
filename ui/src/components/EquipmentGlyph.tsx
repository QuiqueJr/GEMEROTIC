import {
  CircuitBoard,
  HardDrive,
  Monitor,
  MonitorCog,
  Network,
  PanelTop,
  RadioReceiver,
  Router,
  Server,
  ServerCog,
  ShieldCog,
  WifiCog,
  type LucideIcon,
} from 'lucide-react'
import type { CSSProperties } from 'react'

import type { AssetType } from '../domain/topologyTypes'

type EquipmentGlyphProps = {
  assetType: AssetType
  className?: string
  size?: number
}

type GlyphProfile = 'appliance' | 'controller' | 'screen' | 'rack' | 'radio'

type GlyphDefinition = {
  Icon: LucideIcon
  label: string
  ports: number
  profile: GlyphProfile
  signal?: boolean
}

const glyphDefinitions: Record<AssetType, GlyphDefinition> = {
  router: {
    Icon: Router,
    label: 'RTR',
    ports: 4,
    profile: 'appliance',
  },
  switch: {
    Icon: Network,
    label: 'SW',
    ports: 8,
    profile: 'rack',
  },
  firewall: {
    Icon: ShieldCog,
    label: 'FW',
    ports: 4,
    profile: 'appliance',
  },
  server: {
    Icon: Server,
    label: 'SRV',
    ports: 3,
    profile: 'rack',
  },
  scada_server: {
    Icon: ServerCog,
    label: 'SCADA',
    ports: 3,
    profile: 'rack',
  },
  host: {
    Icon: Monitor,
    label: 'ENG',
    ports: 1,
    profile: 'screen',
  },
  plc: {
    Icon: CircuitBoard,
    label: 'PLC',
    ports: 6,
    profile: 'controller',
  },
  hmi: {
    Icon: MonitorCog,
    label: 'HMI',
    ports: 1,
    profile: 'screen',
  },
  rtu: {
    Icon: RadioReceiver,
    label: 'RTU',
    ports: 3,
    profile: 'radio',
    signal: true,
  },
  patch_panel: {
    Icon: PanelTop,
    label: 'PATCH',
    ports: 12,
    profile: 'rack',
  },
  wireless_ap: {
    Icon: WifiCog,
    label: 'AP',
    ports: 1,
    profile: 'radio',
    signal: true,
  },
}

export function EquipmentGlyph({
  assetType,
  className,
  size = 44,
}: EquipmentGlyphProps) {
  const definition = glyphDefinitions[assetType] ?? {
    Icon: HardDrive,
    label: 'DEV',
    ports: 2,
    profile: 'appliance' as GlyphProfile,
  }
  const Icon = definition.Icon
  const classes = ['equipment-glyph', `equipment-glyph--${assetType}`, className]
    .filter(Boolean)
    .join(' ')
  const compact = size < 34
  const style = {
    '--glyph-size': `${size}px`,
  } as CSSProperties

  return (
    <span
      aria-hidden="true"
      className={classes}
      data-compact={compact}
      data-profile={definition.profile}
      style={style}
    >
      <span className="equipment-glyph__plate">
        <Icon
          className="equipment-glyph__icon"
          size={Math.max(14, Math.round(size * 0.42))}
          strokeWidth={2.15}
        />
        {definition.signal ? (
          <span className="equipment-glyph__signal" />
        ) : null}
        <span className="equipment-glyph__ports">
          {Array.from({ length: definition.ports }, (_, index) => (
            <span key={`${assetType}-port-${index}`} />
          ))}
        </span>
        <span className="equipment-glyph__tag">{definition.label}</span>
      </span>
    </span>
  )
}
