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
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      height={size}
      viewBox="0 0 64 64"
      width={size}
    >
      {renderGlyph(assetType)}
    </svg>
  )
}

function renderGlyph(assetType: AssetType) {
  switch (assetType) {
    case 'router':
      return (
        <>
          <rect
            height="28"
            rx="6"
            stroke="currentColor"
            strokeWidth="2.4"
            width="40"
            x="12"
            y="18"
          />
          <path d="M22 27h20M22 37h20" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <path d="M18 32h-5m33 0h5" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <path d="m18 24 4 3-4 3m28-6-4 3 4 3" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
        </>
      )
    case 'switch':
      return (
        <>
          <rect
            height="22"
            rx="5"
            stroke="currentColor"
            strokeWidth="2.4"
            width="44"
            x="10"
            y="21"
          />
          {[16, 23, 30, 37, 44].map((x) => (
            <rect
              height="4.5"
              key={`switch-port-${x}`}
              rx="1"
              stroke="currentColor"
              strokeWidth="2"
              width="4.5"
              x={x}
              y="30"
            />
          ))}
          <circle cx="49" cy="27" fill="currentColor" r="1.8" />
        </>
      )
    case 'firewall':
      return (
        <>
          <rect
            height="26"
            rx="6"
            stroke="currentColor"
            strokeWidth="2.4"
            width="42"
            x="11"
            y="19"
          />
          <path d="M22 29h20M22 36h20" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <path
            d="M32 10c4.7 3.4 8.6 4.9 12 5.5v8.5c0 7.1-4.1 12.2-12 16-7.9-3.8-12-8.9-12-16v-8.5c3.4-.6 7.3-2.1 12-5.5Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
          />
        </>
      )
    case 'host':
      return (
        <>
          <rect
            height="24"
            rx="4"
            stroke="currentColor"
            strokeWidth="2.4"
            width="34"
            x="15"
            y="14"
          />
          <path d="M24 48h16M28 38v10m8-10v10" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <circle cx="46" cy="34" fill="currentColor" r="1.7" />
        </>
      )
    case 'server':
      return (
        <>
          <rect
            height="36"
            rx="5"
            stroke="currentColor"
            strokeWidth="2.4"
            width="28"
            x="18"
            y="14"
          />
          <path d="M24 23h16M24 32h16M24 41h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <circle cx="25.5" cy="23" fill="currentColor" r="1.5" />
          <circle cx="25.5" cy="32" fill="currentColor" r="1.5" />
          <circle cx="25.5" cy="41" fill="currentColor" r="1.5" />
        </>
      )
    case 'scada_server':
      return (
        <>
          <rect
            height="18"
            rx="4"
            stroke="currentColor"
            strokeWidth="2.4"
            width="30"
            x="17"
            y="14"
          />
          <path d="M22 48h20M26 32v16m12-16v16" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <path d="m22 27 5-5 5 4 8-7" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
        </>
      )
    case 'plc':
      return (
        <>
          <rect
            height="32"
            rx="5"
            stroke="currentColor"
            strokeWidth="2.4"
            width="30"
            x="17"
            y="16"
          />
          <path d="M23 24h18M23 31h18" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          {[22, 28, 34, 40].map((x) => (
            <path
              d={`M${x} 48v6`}
              key={`plc-terminal-${x}`}
              stroke="currentColor"
              strokeLinecap="round"
              strokeWidth="2.4"
            />
          ))}
          <circle cx="25" cy="39" fill="currentColor" r="1.8" />
          <circle cx="31" cy="39" fill="currentColor" r="1.8" />
        </>
      )
    case 'hmi':
      return (
        <>
          <rect
            height="28"
            rx="5"
            stroke="currentColor"
            strokeWidth="2.4"
            width="36"
            x="14"
            y="14"
          />
          <rect
            height="18"
            rx="2.5"
            stroke="currentColor"
            strokeWidth="2"
            width="24"
            x="20"
            y="19"
          />
          <path d="M25 48h14M28 42v6m8-6v6" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
        </>
      )
    case 'rtu':
      return (
        <>
          <rect
            height="30"
            rx="5"
            stroke="currentColor"
            strokeWidth="2.4"
            width="28"
            x="18"
            y="18"
          />
          <path d="M24 25h16M24 33h16" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
          <path d="M32 10v8m0-8 5 5m-5-5-5 5" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.4" />
          <circle cx="26" cy="40" fill="currentColor" r="1.6" />
          <circle cx="32" cy="40" fill="currentColor" r="1.6" />
        </>
      )
    case 'patch_panel':
      return (
        <>
          <rect
            height="18"
            rx="4"
            stroke="currentColor"
            strokeWidth="2.4"
            width="46"
            x="9"
            y="23"
          />
          {[16, 24, 32, 40, 48].map((x) => (
            <circle cx={x} cy="32" fill="currentColor" key={`patch-port-${x}`} r="1.8" />
          ))}
        </>
      )
    case 'wireless_ap':
      return (
        <>
          <circle cx="32" cy="30" r="8" stroke="currentColor" strokeWidth="2.4" />
          <path
            d="M21 24c6-6 16-6 22 0M16 19c9-9 23-9 32 0M27 47h10"
            stroke="currentColor"
            strokeLinecap="round"
            strokeWidth="2.4"
          />
        </>
      )
    default:
      return (
        <>
          <rect
            height="30"
            rx="6"
            stroke="currentColor"
            strokeWidth="2.4"
            width="34"
            x="15"
            y="17"
          />
          <path d="M22 26h20M22 34h20" stroke="currentColor" strokeLinecap="round" strokeWidth="2.4" />
        </>
      )
  }
}
