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
      return <RackDevice kind="router" />
    case 'switch':
      return <RackDevice kind="switch" />
    case 'firewall':
      return <RackDevice kind="firewall" />
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
      return <RackDevice kind="switch" />
  }
}

function DeviceShadow({ cx, cy, rx, ry }: { cx: number; cy: number; rx: number; ry: number }) {
  return <ellipse cx={cx} cy={cy} fill="rgba(10, 14, 18, 0.16)" rx={rx} ry={ry} />
}

function Screw({ cx, cy }: { cx: number; cy: number }) {
  return (
    <>
      <circle cx={cx} cy={cy} fill="rgba(29, 38, 47, 0.74)" r="1.4" />
      <path d={`M${cx - 0.7} ${cy}h1.4`} opacity="0.46" stroke="#f3f6f8" strokeWidth="0.9" />
    </>
  )
}

function RackDevice({ kind }: { kind: 'router' | 'switch' | 'firewall' }) {
  return (
    <>
      <DeviceShadow cx={60} cy={76} rx={37} ry={6} />
      <path
        d="M16 28h77l10 8H26z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M16 28v24h77V36l-77-.01Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M93 36v16l10-8V36z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M21 35h66"
        opacity="0.4"
        stroke="rgba(255,255,255,0.76)"
        strokeLinecap="round"
        strokeWidth="1.4"
      />
      <rect fill="rgba(255,255,255,0.22)" height="4" rx="2" width="26" x="24" y="32" />
      <rect fill="rgba(35,47,59,0.16)" height="13" rx="5" width="58" x="24" y="37.5" />
      <Screw cx={22} cy={33} />
      <Screw cx={87} cy={33} />
      <Screw cx={22} cy={47} />
      <Screw cx={87} cy={47} />
      {kind === 'router' ? <RouterFaceplate /> : null}
      {kind === 'switch' ? <SwitchFaceplate /> : null}
      {kind === 'firewall' ? <FirewallFaceplate /> : null}
    </>
  )
}

function RouterFaceplate() {
  return (
    <>
      <circle cx="28" cy="43.5" fill="var(--glyph-led)" r="2.3" />
      {[34, 42, 50].map((x) => (
        <circle cx={x} cy="43.5" fill="rgba(240, 244, 248, 0.86)" key={`router-led-${x}`} r="1.6" />
      ))}
      <path
        d="M58 33.5h9m-4.5 0v5"
        stroke="rgba(38,50,62,0.76)"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
      <path
        d="m56 43 7-5m-7 5 7 5m2-10 7 5-7 5"
        stroke="var(--glyph-detail)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      {[74, 79, 84].map((x) => (
        <rect
          fill="rgba(33,45,57,0.74)"
          height="6"
          key={`router-port-${x}`}
          rx="1.2"
          width="3.4"
          x={x}
          y="40"
        />
      ))}
      <path d="M24 49.5h60" opacity="0.22" stroke="rgba(25,34,42,0.88)" strokeWidth="1.1" />
    </>
  )
}

function SwitchFaceplate() {
  return (
    <>
      <circle cx="27.5" cy="43.5" fill="var(--glyph-led)" r="2.2" />
      <circle cx="33.5" cy="43.5" fill="rgba(255,255,255,0.82)" r="1.5" />
      {Array.from({ length: 10 }, (_, index) => 40 + index * 4.5).map((x) => (
        <g key={`switch-port-${x}`}>
          <rect fill="rgba(34,46,58,0.82)" height="5.8" rx="0.8" width="3.2" x={x} y="39.8" />
          <rect fill="rgba(255,255,255,0.72)" height="2.2" rx="0.6" width="3.2" x={x} y="33.8" />
        </g>
      ))}
      <rect fill="rgba(31,43,53,0.78)" height="5.6" rx="1.1" width="8" x="84" y="39.8" />
      <rect fill="rgba(255,255,255,0.72)" height="2.2" rx="0.6" width="8" x="84" y="33.8" />
      <path d="M24 49.5h66" opacity="0.18" stroke="rgba(25,34,42,0.86)" strokeWidth="1.1" />
    </>
  )
}

function FirewallFaceplate() {
  return (
    <>
      <circle cx="27.5" cy="43.5" fill="var(--glyph-led)" r="2.2" />
      {[34, 40].map((x) => (
        <circle cx={x} cy="43.5" fill="rgba(255,255,255,0.82)" key={`firewall-led-${x}`} r="1.5" />
      ))}
      {[68, 73, 78, 83].map((x) => (
        <rect
          fill="rgba(33,45,57,0.8)"
          height="6.2"
          key={`firewall-port-${x}`}
          rx="1.1"
          width="3.5"
          x={x}
          y="39.6"
        />
      ))}
      <path
        d="M54 31c4.1 2.8 7.4 4 12 4.8v7.6c0 7.2-4.3 12.1-12 15.7-7.7-3.6-12-8.5-12-15.7v-7.6c4.6-.8 8-2 12-4.8Z"
        fill="rgba(255,255,255,0.22)"
        stroke="var(--glyph-detail)"
        strokeWidth="1.8"
      />
      <path d="M54 36.5v14" stroke="var(--glyph-detail)" strokeLinecap="round" strokeWidth="2" />
      <path d="M48.5 42h11" stroke="var(--glyph-detail)" strokeLinecap="round" strokeWidth="2" />
    </>
  )
}

function TowerDevice({ kind }: { kind: 'server' | 'scada' }) {
  return (
    <>
      <DeviceShadow cx={55} cy={76} rx={25} ry={5.4} />
      <path
        d="M34 16h24l7 7H41z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M34 16v42h31V23l-31-.01Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M65 23v35l7-6V17z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M38 23h21"
        opacity="0.38"
        stroke="rgba(255,255,255,0.76)"
        strokeLinecap="round"
        strokeWidth="1.3"
      />
      <Screw cx={37.5} cy={21.5} />
      <Screw cx={61.5} cy={21.5} />
      <Screw cx={37.5} cy={54.5} />
      <Screw cx={61.5} cy={54.5} />
      {kind === 'server' ? <ServerFront /> : <ScadaFront />}
    </>
  )
}

function ServerFront() {
  return (
    <>
      {[27, 35, 43].map((y) => (
        <g key={`server-bay-${y}`}>
          <rect
            fill="rgba(38,49,60,0.18)"
            height="6"
            rx="1.4"
            width="18"
            x="42"
            y={y}
          />
          <rect fill="rgba(255,255,255,0.84)" height="1.6" rx="0.8" width="11" x="45.5" y={y + 1.4} />
        </g>
      ))}
      <rect fill="rgba(34,47,57,0.7)" height="22" rx="2.6" width="4" x="37.5" y="25.5" />
      <circle cx="39.5" cy="30" fill="var(--glyph-led)" r="1.5" />
      <circle cx="39.5" cy="36" fill="rgba(255,255,255,0.82)" r="1.3" />
      <circle cx="39.5" cy="42" fill="rgba(255,255,255,0.82)" r="1.3" />
    </>
  )
}

function ScadaFront() {
  return (
    <>
      <rect
        fill="var(--glyph-screen)"
        height="17"
        rx="2.8"
        stroke="rgba(33,45,55,0.64)"
        strokeWidth="1.4"
        width="18"
        x="42"
        y="25"
      />
      <path
        d="m45 38 4-4 3.4 2 5.2-7"
        stroke="rgba(239,248,248,0.96)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.9"
      />
      <rect fill="rgba(255,255,255,0.42)" height="2.4" rx="1" width="10" x="45" y="28" />
      <rect fill="rgba(34,47,57,0.66)" height="18" rx="2" width="4" x="37.5" y="25" />
      <circle cx="39.5" cy="30" fill="var(--glyph-led)" r="1.5" />
      <circle cx="39.5" cy="36" fill="rgba(255,255,255,0.82)" r="1.3" />
      <path
        d="M24 34h12m-6-6v12"
        stroke="rgba(63, 84, 100, 0.64)"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </>
  )
}

function WorkstationDevice() {
  return (
    <>
      <DeviceShadow cx={58} cy={76} rx={31} ry={5.6} />
      <path
        d="M27 18h40l7 7H34z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M27 18v28h47V25l-47-.01Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M74 25v21l7-6V19z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <rect
        fill="var(--glyph-screen)"
        height="15"
        rx="2.4"
        stroke="rgba(33,45,55,0.66)"
        strokeWidth="1.4"
        width="28"
        x="37"
        y="24"
      />
      <rect fill="rgba(255,255,255,0.42)" height="2.8" rx="1.2" width="16" x="41" y="27" />
      <path d="M51 46v10m-10 0h20" stroke="var(--glyph-stroke)" strokeLinecap="round" strokeWidth="1.9" />
      <path d="M34 59h34l-5 4H39z" fill="var(--glyph-side)" stroke="var(--glyph-stroke)" strokeWidth="1.4" />
      <path d="M35 55h32l6 4H41z" fill="var(--glyph-top)" stroke="var(--glyph-stroke)" strokeWidth="1.3" />
      {Array.from({ length: 6 }, (_, index) => 41 + index * 4.2).map((x) => (
        <rect
          fill="rgba(52,64,76,0.76)"
          height="2.6"
          key={`keyboard-${x}`}
          rx="0.8"
          width="2.8"
          x={x}
          y="57.2"
        />
      ))}
    </>
  )
}

function ControllerDevice({ kind }: { kind: 'plc' | 'hmi' | 'rtu' }) {
  return (
    <>
      <DeviceShadow cx={58} cy={76} rx={29} ry={5.4} />
      {kind === 'plc' ? <PlcDevice /> : null}
      {kind === 'hmi' ? <HmiDevice /> : null}
      {kind === 'rtu' ? <RtuDevice /> : null}
    </>
  )
}

function PlcDevice() {
  return (
    <>
      <path
        d="M30 22h34l8 7H38z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M30 22v34h42V29l-42-.01Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M72 29v27l7-6V24z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      {Array.from({ length: 8 }, (_, index) => 34 + index * 4.2).map((x) => (
        <rect
          fill="rgba(48,61,73,0.78)"
          height="5.4"
          key={`plc-top-${x}`}
          rx="0.8"
          width="2.8"
          x={x}
          y="23.4"
        />
      ))}
      <rect fill="rgba(255,255,255,0.18)" height="15" rx="3" width="16" x="36" y="32" />
      <path d="M54 31.5v20" opacity="0.32" stroke="rgba(35,47,57,0.82)" strokeWidth="1.2" />
      {[38.5, 43.5, 48.5].map((cx) => (
        <circle cx={cx} cy="36.5" fill="var(--glyph-led)" key={`plc-led-${cx}`} r="1.3" />
      ))}
      {Array.from({ length: 6 }, (_, index) => 36 + index * 5.2).map((x) => (
        <rect
          fill="rgba(45,58,69,0.82)"
          height="6.4"
          key={`plc-io-${x}`}
          rx="0.9"
          width="3.2"
          x={x}
          y="49"
        />
      ))}
      <rect fill="rgba(255,255,255,0.3)" height="12" rx="2" width="10" x="58" y="35" />
    </>
  )
}

function HmiDevice() {
  return (
    <>
      <path
        d="M28 24h36l7 7H35z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M28 24v30h43V31l-43-.01Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M71 31v23l6-5V26z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <rect
        fill="var(--glyph-screen)"
        height="18"
        rx="2.8"
        stroke="rgba(32,45,55,0.68)"
        strokeWidth="1.5"
        width="27"
        x="34"
        y="29"
      />
      <rect fill="rgba(255,255,255,0.42)" height="2.6" rx="1.1" width="15" x="39" y="32.2" />
      <path d="m39 42 4.5-4 4 2 6-6" stroke="rgba(241,248,250,0.96)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
      {Array.from({ length: 4 }, (_, index) => 35 + index * 7.3).map((x) => (
        <circle cx={x} cy="50.5" fill="rgba(247,250,252,0.86)" key={`hmi-key-${x}`} r="1.7" />
      ))}
      <rect fill="rgba(46,58,70,0.78)" height="5.2" rx="1.2" width="6.8" x="63" y="37.5" />
    </>
  )
}

function RtuDevice() {
  return (
    <>
      <path
        d="M34 22h28l8 7H42z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M34 22v34h36V29l-36-.01Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M70 29v27l7-6V24z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path d="M52 12v10m0-10 5 5m-5-5-5 5" stroke="var(--glyph-detail)" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" />
      <rect fill="rgba(255,255,255,0.22)" height="12" rx="2.4" width="14" x="41" y="31" />
      <circle cx="45" cy="35.5" fill="var(--glyph-led)" r="1.4" />
      <circle cx="50" cy="35.5" fill="rgba(255,255,255,0.82)" r="1.3" />
      <circle cx="55" cy="35.5" fill="rgba(255,255,255,0.82)" r="1.3" />
      {Array.from({ length: 5 }, (_, index) => 39 + index * 6).map((x) => (
        <rect
          fill="rgba(45,58,69,0.82)"
          height="6"
          key={`rtu-io-${x}`}
          rx="0.9"
          width="3.4"
          x={x}
          y="48.5"
        />
      ))}
    </>
  )
}

function PatchPanelDevice() {
  return (
    <>
      <DeviceShadow cx={60} cy={74} rx={38} ry={5.8} />
      <path
        d="M16 35h79l9 8H25z"
        fill="var(--glyph-top)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M16 35v14h79V43l-79-.01Z"
        fill="var(--glyph-front)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.7"
      />
      <path
        d="M95 43v6l9-7v-7z"
        fill="var(--glyph-side)"
        stroke="var(--glyph-stroke)"
        strokeLinejoin="round"
        strokeWidth="1.4"
      />
      <rect fill="rgba(33,45,57,0.16)" height="8.5" rx="4" width="60" x="24" y="39.2" />
      {Array.from({ length: 8 }, (_, index) => 28 + index * 7.1).map((x) => (
        <g key={`patch-port-${x}`}>
          <rect fill="rgba(40,53,63,0.84)" height="5.3" rx="1" width="4.2" x={x} y="41" />
          <path d={`M${x + 0.8} 42.6h2.6`} opacity="0.44" stroke="#eef3f6" strokeWidth="0.9" />
        </g>
      ))}
      <rect fill="rgba(255,255,255,0.22)" height="2.6" rx="1.2" width="18" x="24" y="36.8" />
      <Screw cx={21.5} cy={41.5} />
      <Screw cx={89.5} cy={41.5} />
    </>
  )
}

function WirelessDevice() {
  return (
    <>
      <DeviceShadow cx={60} cy={74} rx={24} ry={5} />
      <ellipse
        cx="60"
        cy="43"
        fill="var(--glyph-front)"
        rx="24"
        ry="13"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.8"
      />
      <ellipse
        cx="60"
        cy="38"
        fill="var(--glyph-top)"
        rx="21"
        ry="10"
        stroke="var(--glyph-stroke)"
        strokeWidth="1.5"
      />
      <path d="M48 35c7-6.5 17-6.5 24 0M43 28c10-9.5 24-9.5 34 0" stroke="var(--glyph-detail)" strokeLinecap="round" strokeWidth="2" />
      <circle cx="60" cy="38" fill="var(--glyph-led)" r="2.2" />
      <path d="M51 46h18" opacity="0.18" stroke="rgba(21,31,39,0.84)" strokeWidth="1.2" />
    </>
  )
}
