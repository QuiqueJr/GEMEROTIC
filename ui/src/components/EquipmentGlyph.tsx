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
      viewBox="0 0 120 88"
      width={size}
    >
      {renderGlyph(assetType)}
    </svg>
  )
}

function renderGlyph(assetType: AssetType) {
  switch (assetType) {
    case 'router':
      return <RackUnit kind="router" />
    case 'switch':
      return <RackUnit kind="switch" />
    case 'firewall':
      return <RackUnit kind="firewall" />
    case 'server':
      return <ServerTower kind="server" />
    case 'scada_server':
      return <ServerTower kind="scada" />
    case 'host':
      return <Workstation />
    case 'plc':
      return <IndustrialController kind="plc" />
    case 'hmi':
      return <IndustrialController kind="hmi" />
    case 'rtu':
      return <IndustrialController kind="rtu" />
    case 'patch_panel':
      return <PatchPanel />
    case 'wireless_ap':
      return <WirelessAccessPoint />
    default:
      return <RackUnit kind="switch" />
  }
}

function Frame({
  x,
  y,
  width,
  height,
  radius = 8,
}: {
  x: number
  y: number
  width: number
  height: number
  radius?: number
}) {
  return (
    <rect
      fill="var(--glyph-front)"
      height={height}
      rx={radius}
      stroke="var(--glyph-stroke)"
      strokeWidth="1.8"
      width={width}
      x={x}
      y={y}
    />
  )
}

function StatusLights({ values }: { values: number[] }) {
  return (
    <>
      {values.map((x, index) => (
        <circle
          cx={x}
          cy="35"
          fill={index === 0 ? 'var(--glyph-led)' : 'var(--glyph-detail)'}
          key={`led-${x}`}
          r="2"
        />
      ))}
    </>
  )
}

function Screw({ x, y }: { x: number; y: number }) {
  return (
    <>
      <circle cx={x} cy={y} fill="var(--glyph-stroke)" r="1.2" />
      <path d={`M${x - 0.8} ${y}h1.6`} opacity="0.4" stroke="#ffffff" strokeWidth="0.8" />
    </>
  )
}

function RackUnit({ kind }: { kind: 'router' | 'switch' | 'firewall' }) {
  return (
    <>
      <Frame x={14} y={24} width={92} height={28} radius={7} />
      <rect fill="var(--glyph-accent)" height="5" rx="2.5" width="22" x="22" y="28" />
      <path d="M18 38h84" opacity="0.16" stroke="var(--glyph-stroke)" strokeWidth="1" />
      <Screw x={20} y={30} />
      <Screw x={100} y={30} />
      <Screw x={20} y={46} />
      <Screw x={100} y={46} />
      {kind === 'router' ? <RouterFace /> : null}
      {kind === 'switch' ? <SwitchFace /> : null}
      {kind === 'firewall' ? <FirewallFace /> : null}
    </>
  )
}

function RouterFace() {
  return (
    <>
      <StatusLights values={[28, 34, 40]} />
      <path
        d="M52 34h18m-9-4v8m-10 7 8-5m-8 5 8 5m4-10 8 5-8 5"
        stroke="var(--glyph-stroke)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      {[82, 88, 94].map((x) => (
        <rect
          fill="var(--glyph-detail-dark)"
          height="6"
          key={`router-port-${x}`}
          rx="1"
          width="4"
          x={x}
          y="39"
        />
      ))}
    </>
  )
}

function SwitchFace() {
  return (
    <>
      <StatusLights values={[28, 34]} />
      {Array.from({ length: 10 }, (_, index) => 44 + index * 5).map((x) => (
        <g key={`switch-port-${x}`}>
          <rect fill="var(--glyph-detail-dark)" height="5" rx="0.8" width="3.6" x={x} y="39" />
          <rect fill="var(--glyph-detail)" height="2.4" rx="0.8" width="3.6" x={x} y="31.5" />
        </g>
      ))}
    </>
  )
}

function FirewallFace() {
  return (
    <>
      <StatusLights values={[28, 34]} />
      <path
        d="M60 28c4.6 3 8 4.1 12 4.8v8.2c0 7.2-4.6 11.8-12 15-7.4-3.2-12-7.8-12-15v-8.2c4-.7 7.4-1.8 12-4.8Z"
        fill="rgba(255,255,255,0.22)"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.6"
      />
      <path d="M60 35v12m-5.5-6h11" stroke="var(--glyph-stroke)" strokeLinecap="round" strokeWidth="1.8" />
      {[86, 92].map((x) => (
        <rect
          fill="var(--glyph-detail-dark)"
          height="6"
          key={`firewall-port-${x}`}
          rx="1"
          width="4"
          x={x}
          y="39"
        />
      ))}
    </>
  )
}

function ServerTower({ kind }: { kind: 'server' | 'scada' }) {
  return (
    <>
      <Frame x={36} y={14} width={32} height={52} radius={6} />
      <rect fill="rgba(255,255,255,0.16)" height="4" rx="2" width="20" x="42" y="18" />
      {kind === 'server' ? (
        <>
          {[28, 38, 48].map((y) => (
            <g key={`bay-${y}`}>
              <rect fill="var(--glyph-detail-dark)" height="6" rx="1.2" width="18" x="43" y={y} />
              <rect fill="var(--glyph-detail)" height="1.6" rx="0.8" width="10" x="47" y={y + 1.5} />
            </g>
          ))}
        </>
      ) : (
        <>
          <rect
            fill="var(--glyph-screen)"
            height="18"
            rx="2.4"
            stroke="var(--glyph-stroke)"
            strokeWidth="1.2"
            width="18"
            x="43"
            y="27"
          />
          <path
            d="m46 41 4-4 3 2 5-6"
            stroke="var(--glyph-detail)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </>
      )}
      <StatusLights values={[41, 47, 53]} />
    </>
  )
}

function Workstation() {
  return (
    <>
      <rect
        fill="var(--glyph-front)"
        height="26"
        rx="5"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.8"
        width="42"
        x="22"
        y="18"
      />
      <rect
        fill="var(--glyph-screen)"
        height="16"
        rx="2.6"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.2"
        width="28"
        x="29"
        y="23"
      />
      <rect fill="rgba(255,255,255,0.28)" height="2.4" rx="1.2" width="14" x="35" y="26" />
      <path d="M43 44v8m-10 0h20" stroke="var(--glyph-stroke)" strokeLinecap="round" strokeWidth="1.8" />
      <rect fill="var(--glyph-accent)" height="5" rx="2.4" width="26" x="30" y="56" />
      {Array.from({ length: 7 }, (_, index) => 33 + index * 3.2).map((x) => (
        <rect
          fill="var(--glyph-detail)"
          height="1.8"
          key={`key-${x}`}
          rx="0.8"
          width="2"
          x={x}
          y="57.6"
        />
      ))}
      <Frame x={72} y={22} width={18} height={32} radius={4} />
      <rect fill="var(--glyph-detail-dark)" height="4" rx="1.2" width="10" x="76" y="30" />
      <rect fill="var(--glyph-detail-dark)" height="4" rx="1.2" width="10" x="76" y="38" />
    </>
  )
}

function IndustrialController({ kind }: { kind: 'plc' | 'hmi' | 'rtu' }) {
  if (kind === 'plc') {
    return <PlcIcon />
  }
  if (kind === 'hmi') {
    return <HmiIcon />
  }
  return <RtuIcon />
}

function PlcIcon() {
  return (
    <>
      <Frame x={30} y={20} width={44} height={38} radius={5} />
      {Array.from({ length: 8 }, (_, index) => 34 + index * 4.4).map((x) => (
        <rect
          fill="var(--glyph-detail-dark)"
          height="5"
          key={`plc-top-${x}`}
          rx="0.6"
          width="2.6"
          x={x}
          y="20"
        />
      ))}
      <rect fill="rgba(255,255,255,0.2)" height="14" rx="2.4" width="16" x="38" y="30" />
      <StatusLights values={[42, 47, 52]} />
      {Array.from({ length: 6 }, (_, index) => 38 + index * 5.2).map((x) => (
        <rect
          fill="var(--glyph-detail-dark)"
          height="6"
          key={`plc-bottom-${x}`}
          rx="0.8"
          width="3.2"
          x={x}
          y="48"
        />
      ))}
      <rect fill="var(--glyph-accent)" height="12" rx="2" width="10" x="58" y="31" />
    </>
  )
}

function HmiIcon() {
  return (
    <>
      <rect
        fill="var(--glyph-front)"
        height="36"
        rx="5"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.8"
        width="44"
        x="28"
        y="20"
      />
      <rect
        fill="var(--glyph-screen)"
        height="18"
        rx="2.6"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.2"
        width="28"
        x="36"
        y="26"
      />
      <rect fill="rgba(255,255,255,0.28)" height="2.4" rx="1" width="14" x="43" y="29" />
      <path
        d="m41 40 5-4 4 2 7-6"
        stroke="var(--glyph-detail)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      {Array.from({ length: 4 }, (_, index) => 39 + index * 8).map((x) => (
        <circle cx={x} cy="50" fill="var(--glyph-detail)" key={`hmi-btn-${x}`} r="1.6" />
      ))}
    </>
  )
}

function RtuIcon() {
  return (
    <>
      <Frame x={34} y={22} width={36} height={34} radius={5} />
      <path
        d="M52 12v10m0-10 5 5m-5-5-5 5"
        stroke="var(--glyph-stroke)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <rect fill="rgba(255,255,255,0.2)" height="12" rx="2.2" width="14" x="41" y="29" />
      <StatusLights values={[45, 50, 55]} />
      {Array.from({ length: 5 }, (_, index) => 40 + index * 6).map((x) => (
        <rect
          fill="var(--glyph-detail-dark)"
          height="6"
          key={`rtu-port-${x}`}
          rx="0.8"
          width="3.2"
          x={x}
          y="46"
        />
      ))}
    </>
  )
}

function PatchPanel() {
  return (
    <>
      <Frame x={14} y={30} width={92} height={18} radius={6} />
      <rect fill="rgba(255,255,255,0.22)" height="3" rx="1.5" width="22" x="22" y="34" />
      {Array.from({ length: 10 }, (_, index) => 28 + index * 7.2).map((x) => (
        <g key={`patch-${x}`}>
          <rect fill="var(--glyph-detail-dark)" height="5" rx="1" width="4" x={x} y="37" />
          <circle cx={x + 2} cy="39.5" fill="var(--glyph-detail)" r="0.7" />
        </g>
      ))}
      <Screw x={20} y={39} />
      <Screw x={100} y={39} />
    </>
  )
}

function WirelessAccessPoint() {
  return (
    <>
      <circle
        cx="60"
        cy="40"
        fill="var(--glyph-front)"
        r="16"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.8"
      />
      <circle cx="60" cy="40" fill="var(--glyph-led)" r="2.2" />
      <path
        d="M49 37c6-5 16-5 22 0M44 31c9-8 23-8 32 0"
        stroke="var(--glyph-accent)"
        strokeLinecap="round"
        strokeWidth="2"
      />
      <path d="M52 49h16" stroke="var(--glyph-stroke)" strokeLinecap="round" strokeWidth="1.4" />
    </>
  )
}
