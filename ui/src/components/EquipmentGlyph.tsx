import type { AssetType } from '../domain/topologyTypes'

type EquipmentGlyphProps = {
  assetType: AssetType
  className?: string
  size?: number
}

export function EquipmentGlyph({
  assetType,
  className,
  size = 44,
}: EquipmentGlyphProps) {
  const classes = ['equipment-glyph', `equipment-glyph--${assetType}`, className]
    .filter(Boolean)
    .join(' ')

  return (
    <svg
      aria-hidden="true"
      className={classes}
      fill="none"
      height={size}
      viewBox="0 0 96 96"
      width={size}
    >
      {renderGlyph(assetType)}
    </svg>
  )
}

function renderGlyph(assetType: AssetType) {
  switch (assetType) {
    case 'router':
      return <RouterIcon />
    case 'switch':
      return <SwitchIcon />
    case 'firewall':
      return <FirewallIcon />
    case 'server':
      return <ServerIcon label="SRV" />
    case 'scada_server':
      return <ServerIcon label="SCADA" scada />
    case 'host':
      return <WorkstationIcon />
    case 'plc':
      return <PlcIcon />
    case 'hmi':
      return <HmiIcon />
    case 'rtu':
      return <RtuIcon />
    case 'patch_panel':
      return <PatchPanelIcon />
    case 'wireless_ap':
      return <WirelessApIcon />
    default:
      return <SwitchIcon />
  }
}

function DeviceText({
  children,
  x,
  y,
  size = 7,
}: {
  children: string
  x: number
  y: number
  size?: number
}) {
  return (
    <text
      fill="var(--glyph-ink)"
      fontFamily="ui-monospace, SFMono-Regular, Consolas, monospace"
      fontSize={size}
      fontWeight="800"
      letterSpacing="0"
      textAnchor="middle"
      x={x}
      y={y}
    >
      {children}
    </text>
  )
}

function PortRow({
  count,
  startX,
  y,
}: {
  count: number
  startX: number
  y: number
}) {
  return (
    <>
      {Array.from({ length: count }, (_, index) => (
        <rect
          fill="var(--glyph-port)"
          height="5"
          key={`port-${startX}-${index}`}
          rx="1"
          width="4.2"
          x={startX + index * 6}
          y={y}
        />
      ))}
    </>
  )
}

function RouterIcon() {
  return (
    <>
      <circle
        cx="48"
        cy="42"
        fill="var(--glyph-panel)"
        r="26"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
      />
      <circle cx="48" cy="42" fill="var(--glyph-body)" r="18" />
      <path
        d="M48 25v34M31 42h34M38 32l-7 10 7 10M58 32l7 10-7 10M38 32h20M38 52h20"
        stroke="var(--glyph-mark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      <rect
        fill="var(--glyph-base)"
        height="14"
        rx="4"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.8"
        width="52"
        x="22"
        y="66"
      />
      <PortRow count={6} startX={31} y={70} />
      <DeviceText x={48} y={88}>ROUTER</DeviceText>
    </>
  )
}

function SwitchIcon() {
  return (
    <>
      <rect
        fill="var(--glyph-body)"
        height="34"
        rx="6"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="70"
        x="13"
        y="30"
      />
      <rect fill="var(--glyph-panel)" height="8" rx="3" width="24" x="22" y="37" />
      <PortRow count={10} startX={24} y={51} />
      <circle cx="68" cy="41" fill="var(--glyph-led)" r="3" />
      <circle cx="76" cy="41" fill="var(--glyph-muted)" r="3" />
      <path d="M18 67h60" stroke="var(--glyph-stroke)" strokeLinecap="round" strokeWidth="2" />
      <DeviceText x={48} y={82}>SWITCH</DeviceText>
    </>
  )
}

function FirewallIcon() {
  return (
    <>
      <rect
        fill="var(--glyph-base)"
        height="30"
        rx="6"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="70"
        x="13"
        y="44"
      />
      <path
        d="M48 15c8 5 15 7 23 8v17c0 16-9 27-23 34-14-7-23-18-23-34V23c8-1 15-3 23-8Z"
        fill="var(--glyph-body)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <path
        d="M48 29v25M36 42h24"
        stroke="var(--glyph-mark)"
        strokeLinecap="round"
        strokeWidth="4"
      />
      <PortRow count={4} startX={57} y={58} />
      <DeviceText x={48} y={88}>FIREWALL</DeviceText>
    </>
  )
}

function ServerIcon({ label, scada = false }: { label: string; scada?: boolean }) {
  return (
    <>
      <rect
        fill="var(--glyph-body)"
        height="64"
        rx="7"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="40"
        x="28"
        y="14"
      />
      <DeviceText x={48} y={27} size={scada ? 5.4 : 7}>{label}</DeviceText>
      {scada ? (
        <>
          <rect
            fill="var(--glyph-screen)"
            height="24"
            rx="4"
            stroke="var(--glyph-stroke)"
            strokeWidth="1.4"
            width="26"
            x="35"
            y="34"
          />
          <path
            d="m39 52 5-7 5 3 7-9"
            stroke="var(--glyph-mark)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
        </>
      ) : (
        <>
          {[34, 45, 56].map((y) => (
            <rect
              fill="var(--glyph-panel)"
              height="7"
              key={`bay-${y}`}
              rx="2"
              width="26"
              x="35"
              y={y}
            />
          ))}
        </>
      )}
      <circle cx="39" cy="68" fill="var(--glyph-led)" r="2.4" />
      <circle cx="48" cy="68" fill="var(--glyph-muted)" r="2.4" />
      <circle cx="57" cy="68" fill="var(--glyph-muted)" r="2.4" />
    </>
  )
}

function WorkstationIcon() {
  return (
    <>
      <rect
        fill="var(--glyph-body)"
        height="34"
        rx="6"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="54"
        x="16"
        y="20"
      />
      <rect fill="var(--glyph-screen)" height="22" rx="3" width="40" x="23" y="26" />
      <path d="M43 55v10M30 65h36" stroke="var(--glyph-stroke)" strokeLinecap="round" strokeWidth="2.6" />
      <rect fill="var(--glyph-base)" height="10" rx="3" width="52" x="22" y="70" />
      <PortRow count={8} startX={30} y={73} />
      <rect fill="var(--glyph-body)" height="36" rx="5" stroke="var(--glyph-stroke)" strokeWidth="2" width="14" x="74" y="33" />
      <DeviceText x={48} y={90}>HOST</DeviceText>
    </>
  )
}

function PlcIcon() {
  return (
    <>
      <rect fill="var(--glyph-base)" height="54" rx="5" width="10" x="18" y="22" />
      <rect
        fill="var(--glyph-body)"
        height="58"
        rx="6"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="50"
        x="28"
        y="19"
      />
      <rect fill="var(--glyph-panel)" height="20" rx="4" width="22" x="36" y="34" />
      <DeviceText x={47} y={47}>PLC</DeviceText>
      <PortRow count={7} startX={34} y={23} />
      <PortRow count={7} startX={34} y={68} />
      <rect fill="var(--glyph-mark)" height="20" rx="3" width="10" x="62" y="34" />
      <circle cx="39" cy="59" fill="var(--glyph-led)" r="2.4" />
      <circle cx="48" cy="59" fill="var(--glyph-muted)" r="2.4" />
      <circle cx="57" cy="59" fill="var(--glyph-muted)" r="2.4" />
    </>
  )
}

function HmiIcon() {
  return (
    <>
      <rect
        fill="var(--glyph-body)"
        height="50"
        rx="7"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="64"
        x="16"
        y="22"
      />
      <rect fill="var(--glyph-screen)" height="30" rx="4" width="46" x="25" y="31" />
      <path
        d="m31 54 8-10 7 5 11-14 8 8"
        stroke="var(--glyph-mark)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.6"
      />
      <DeviceText x={48} y={82}>HMI</DeviceText>
    </>
  )
}

function RtuIcon() {
  return (
    <>
      <path
        d="M48 12v18M40 20l8-8 8 8"
        stroke="var(--glyph-stroke)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      <rect
        fill="var(--glyph-body)"
        height="48"
        rx="7"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="54"
        x="21"
        y="30"
      />
      <rect fill="var(--glyph-panel)" height="18" rx="4" width="24" x="31" y="42" />
      <DeviceText x={43} y={54}>RTU</DeviceText>
      <PortRow count={5} startX={35} y={67} />
      <path d="M61 41c6 4 6 14 0 18M66 36c10 8 10 22 0 30" stroke="var(--glyph-mark)" strokeLinecap="round" strokeWidth="2.2" />
    </>
  )
}

function PatchPanelIcon() {
  return (
    <>
      <rect
        fill="var(--glyph-body)"
        height="24"
        rx="5"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
        width="78"
        x="9"
        y="36"
      />
      <PortRow count={12} startX={16} y={45} />
      <circle cx="17" cy="54" fill="var(--glyph-muted)" r="1.8" />
      <circle cx="79" cy="54" fill="var(--glyph-muted)" r="1.8" />
      <DeviceText x={48} y={76}>PATCH PANEL</DeviceText>
    </>
  )
}

function WirelessApIcon() {
  return (
    <>
      <ellipse
        cx="48"
        cy="48"
        fill="var(--glyph-body)"
        rx="26"
        ry="20"
        stroke="var(--glyph-stroke)"
        strokeWidth="2"
      />
      <circle cx="48" cy="48" fill="var(--glyph-led)" r="3" />
      <path
        d="M34 42c8-7 20-7 28 0M28 34c12-11 28-11 40 0M38 57h20"
        stroke="var(--glyph-mark)"
        strokeLinecap="round"
        strokeWidth="3"
      />
      <DeviceText x={48} y={82}>AP</DeviceText>
    </>
  )
}
