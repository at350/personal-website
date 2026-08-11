import "@/styles/furniture.css";

/* Real Code 128B. Each symbol is 11 modules expressed as 6 alternating
   bar/space widths; the stop pattern has 7 elements (13 modules). */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312",
  "132212", "221213", "221312", "231212", "112232", "122132", "122231", "113222",
  "123122", "123221", "223211", "221132", "221231", "213212", "223112", "312131",
  "311222", "321122", "321221", "312212", "322112", "322211", "212123", "212321",
  "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121",
  "313121", "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111", "111224",
  "111422", "121124", "121421", "141122", "141221", "112214", "112412", "122114",
  "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112",
  "421211", "212141", "214121", "412121", "111143", "111341", "131141", "114113",
  "114311", "411113", "411311", "113141", "114131", "311141", "411131", "211412",
  "211214", "211232", "2331112",
] as const;

const START_B = 104;
const STOP = 106;

export function encodeCode128B(text: string): number[] {
  const values = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Code 128B cannot encode "${ch}"`);
    values.push(code - 32);
  }
  const checksum =
    values.reduce((sum, value, i) => sum + value * Math.max(i, 1), 0) % 103;
  values.push(checksum, STOP);
  return values;
}

export function barcodeModules(text: string): { width: number; bar: boolean }[] {
  const out: { width: number; bar: boolean }[] = [];
  for (const value of encodeCode128B(text)) {
    const pattern = PATTERNS[value]!;
    for (let i = 0; i < pattern.length; i += 1) {
      out.push({ width: Number(pattern[i]), bar: i % 2 === 0 });
    }
  }
  return out;
}

interface BarcodeProps {
  text: string;
  caption?: string;
  height?: number;
}

export function Barcode({ text, caption, height = 34 }: BarcodeProps) {
  const modules = barcodeModules(text);
  const total = modules.reduce((n, m) => n + m.width, 0) + 20; // quiet zones
  const bars: { x: number; width: number }[] = [];
  modules.reduce((x, m) => {
    if (m.bar) bars.push({ x, width: m.width });
    return x + m.width;
  }, 10);
  return (
    <div className="barcode" role="img" aria-label={`Barcode: ${caption ?? text}`}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${total} ${height}`}
        preserveAspectRatio="none"
      >
        {bars.map((b, i) => (
          <rect key={i} x={b.x} y={0} width={b.width} height={height} fill="var(--sumi)" />
        ))}
      </svg>
      {caption ? <span className="barcode__caption mono-label">{caption}</span> : null}
    </div>
  );
}
