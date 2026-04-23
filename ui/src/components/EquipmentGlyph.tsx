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
      viewBox="0 0 88 72"
      width={size}
    >
      {renderGlyph(assetType)}
    </svg>
  )
}

function renderGlyph(assetType: AssetType) {
  switch (assetType) {
    case 'router':
      return <RackAppliance kind="router" />
    case 'switch':
      return <RackAppliance kind="switch" />
    case 'firewall':
      return <RackAppliance kind="firewall" />
    case 'server':
      return <TowerDevice kind="server" />
    case 'scada_server':
      return <TowerDevice kind="scada" />
    case 'host':
      return <WorkstationDevice />
    case 'plc':
      return <ControllerDevice kind="plc" />
    case 'hmi':
      return <ControllerDevice kind="hmi" />
    case 'rtu':
      return <ControllerDevice kind="rtu" />
    case 'patch_panel':
      return <PatchPanelDevice />
    case 'wireless_ap':
      return <WirelessDevice />
    default:
      return <RackAppliance kind="switch" />
  }
}

function RackAppliance({ kind }: { kind: 'router' | 'switch' | 'firewall' }) {
  const hasPorts = kind !== 'router'

  return (
    <>
      <ellipse cx="44" cy="61" fill="rgba(0,0,0,0.14)" rx="24" ry="5" />
      <path
        d="M18 20h40l8 7H26z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M18 20v24h48V27l-8-7z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M66 27v17l4-4V24z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <rect
        fill="var(--glyph-accent)"
        height="5"
        rx="2.5"
        width="10"
        x="24"
        y="24"
      />
      {kind === 'router' ? (
        <>
          <path
            d="M31 34h14"
            stroke="var(--glyph-detail)"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d="m27 34 5-4m-5 4 5 4M49 30l-5 4 5 4"
            stroke="var(--glyph-detail)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
          <circle cx="56" cy="36" fill="var(--glyph-led)" r="2.2" />
        </>
      ) : null}
      {hasPorts ? (
        <>
          {[28, 35, 42, 49].map((x) => (
            <rect
              fill="var(--glyph-detail)"
              height="5"
              key={`${kind}-${x}`}
              rx="1"
              width="5.5"
              x={x}
              y="34"
            />
          ))}
          <circle cx="24" cy="36.5" fill="var(--glyph-led)" r="2" />
        </>
      ) : null}
      {kind === 'firewall' ? (
        <path
          d="M44 17c4 3 7 4.5 10.5 5.2v6.9c0 6.1-3.6 10.4-10.5 13.7-6.9-3.3-10.5-7.6-10.5-13.7v-6.9c3.5-.7 6.5-2.2 10.5-5.2Z"
          fill="rgba(255,255,255,0.24)"
          stroke="var(--glyph-detail)"
          strokeWidth="1.8"
        />
      ) : null}
    </>
  )
}

function TowerDevice({ kind }: { kind: 'server' | 'scada' }) {
  return (
    <>
      <ellipse cx="42" cy="62" fill="rgba(0,0,0,0.12)" rx="18" ry="4.2" />
      <path
        d="M30 14h18l6 6H36z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M30 14v36h24V20l-6-6z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M54 20v30l4-4V18z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      {[24, 32, 40].map((y) => (
        <rect
          fill="var(--glyph-detail)"
          height="4"
          key={`${kind}-${y}`}
          opacity="0.9"
          rx="1.2"
          width="14"
          x="36"
          y={y}
        />
      ))}
      <circle cx="35" cy="26" fill="var(--glyph-led)" r="1.7" />
      <circle cx="35" cy="34" fill="var(--glyph-led)" r="1.7" />
      <circle cx="35" cy="42" fill="var(--glyph-led)" r="1.7" />
      {kind === 'scada' ? (
        <rect
          fill="rgba(255,255,255,0.2)"
          height="10"
          rx="2"
          stroke="var(--glyph-detail)"
          strokeWidth="1.4"
          width="18"
          x="18"
          y="25"
        />
      ) : null}
      {kind === 'scada' ? (
        <path
          d="m21 32 4-3 4 2 4-5"
          stroke="var(--glyph-detail)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
        />
      ) : null}
    </>
  )
}

function WorkstationDevice() {
  return (
    <>
      <ellipse cx="44" cy="60" fill="rgba(0,0,0,0.12)" rx="22" ry="4.5" />
      <path
        d="M24 18h30l6 6H30z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M24 18v22h36V24l-6-6z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M60 24v16l4-4V22z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <rect fill="var(--glyph-accent)" height="11" rx="1.8" width="24" x="30" y="24.5" />
      <path
        d="M42 40v8m-8 0h16"
        stroke="var(--glyph-stroke)"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
      <rect fill="var(--glyph-detail)" height="3.8" rx="1.4" width="18" x="33" y="48" />
    </>
  )
}

function ControllerDevice({ kind }: { kind: 'plc' | 'hmi' | 'rtu' }) {
  return (
    <>
      <ellipse cx="44" cy="61" fill="rgba(0,0,0,0.12)" rx="21" ry="4.5" />
      <path
        d="M24 18h28l6 6H30z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M24 18v28h34V24l-6-6z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M58 24v22l4-4V22z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      {kind === 'plc' ? (
        <>
          <rect fill="var(--glyph-accent)" height="10" rx="2" width="18" x="31" y="25" />
          {[30, 36, 42, 48, 54].map((x) => (
            <rect
              fill="var(--glyph-detail)"
              height="5"
              key={`plc-port-${x}`}
              rx="1"
              width="3.2"
              x={x}
              y="46"
            />
          ))}
        </>
      ) : null}
      {kind === 'hmi' ? (
        <>
          <rect
            fill="var(--glyph-accent)"
            height="14"
            rx="2.4"
            stroke="var(--glyph-detail)"
            strokeWidth="1.4"
            width="22"
            x="30"
            y="23"
          />
          <path
            d="M40 46h6m-3-9v9"
            stroke="var(--glyph-stroke)"
            strokeLinecap="round"
            strokeWidth="1.7"
          />
        </>
      ) : null}
      {kind === 'rtu' ? (
        <>
          <path
            d="M42 13v8m0-8 4 4m-4-4-4 4"
            stroke="var(--glyph-detail)"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
          <rect fill="var(--glyph-accent)" height="10" rx="2" width="18" x="31" y="26" />
          <circle cx="35" cy="40.5" fill="var(--glyph-led)" r="1.8" />
          <circle cx="41" cy="40.5" fill="var(--glyph-led)" r="1.8" />
          <circle cx="47" cy="40.5" fill="var(--glyph-led)" r="1.8" />
        </>
      ) : null}
    </>
  )
}

function PatchPanelDevice() {
  return (
    <>
      <ellipse cx="44" cy="58" fill="rgba(0,0,0,0.1)" rx="23" ry="4" />
      <path
        d="M18 28h42l7 6H25z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M18 28v12h49V34l-7-6z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      {[26, 33, 40, 47, 54].map((x) => (
        <circle cx={x} cy="35" fill="var(--glyph-detail)" key={`patch-${x}`} r="2.1" />
      ))}
    </>
  )
}

function WirelessDevice() {
  return (
    <>
      <ellipse cx="44" cy="61" fill="rgba(0,0,0,0.1)" rx="18" ry="4" />
      <ellipse
        cx="44"
        cy="39"
        fill="var(--glyph-front)"
        rx="18"
        ry="10"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.7"
      />
      <ellipse
        cx="44"
        cy="35"
        fill="var(--glyph-top)"
        rx="16"
        ry="8"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.4"
      />
      <circle cx="44" cy="36" fill="var(--glyph-led)" r="2.1" />
      <path
        d="M32 24c7-7 17-7 24 0M27 18c10-10 24-10 34 0"
        stroke="var(--glyph-detail)"
        strokeLinecap="round"
        strokeWidth="1.8"
      />
    </>
  )
}
