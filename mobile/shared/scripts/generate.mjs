#!/usr/bin/env node
// mobile/shared 원본(tokens.json, strings.ko.json, layout.json, functions/config/zones.yaml, web/shuttle.json)에서
// zones.json, shuttle.json과 Swift·Kotlin 코드를 만든다.
//   node mobile/shared/scripts/generate.mjs          생성
//   node mobile/shared/scripts/generate.mjs --check  생성 결과가 최신인지만 확인(다르면 exit 1)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SHARED = 'mobile/shared';
const IOS_OUT = 'mobile/ios/ICNParkingCore/Sources/ICNParkingCore/Generated';
const KOTLIN_PACKAGE = 'com.studydev.icnparking.core.generated';
const KOTLIN_OUT = `mobile/android/core/src/main/kotlin/${KOTLIN_PACKAGE.replaceAll('.', '/')}`;
const CATEGORIES = { 단기: 'short', 장기: 'long', 타워: 'tower', 예약: 'reserved' };
const TERMINALS = ['T1', 'T2'];
const SWIFT_HEADER = src => `// 생성 파일 — 직접 고치지 마세요.\n// 원본: ${src} · node mobile/shared/scripts/generate.mjs\n`;

const read = path => readFileSync(join(ROOT, path), 'utf8');
const readJson = path => JSON.parse(read(path));
const fail = message => { throw new Error(message); };
const withoutComments = value => Array.isArray(value) ? value.map(withoutComments)
  : value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([k]) => k !== '$comment').map(([k, v]) => [k, withoutComments(v)]))
  : value;

// ---------- zones.yaml ----------
// zones.yaml은 "  - {key: value, key: [a, b]}" 한 줄 = 한 구역 형식만 쓴다. 다른 형식이 나오면 멈춘다.
function parseZonesYaml(text) {
  const zones = [];
  let inZones = false;
  text.split('\n').forEach((raw, i) => {
    if (/^\s*(#|$)/.test(raw)) return;
    const line = raw.replace(/\s+#.*$/, '').trimEnd();
    if (line === 'zones:') { inZones = true; return; }
    const m = inZones && line.match(/^  - \{(.*)\}$/);
    if (!m) fail(`functions/config/zones.yaml:${i + 1}: 지원하지 않는 형식이에요(한 줄 flow mapping만 지원): ${raw}`);
    zones.push(parseFlowMap(m[1], i + 1));
  });
  return zones;
}

function parseFlowMap(body, lineNo) {
  const parts = [];
  let depth = 0, cur = '';
  for (const ch of body) {
    if (ch === '[') depth++;
    if (ch === ']') depth--;
    if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; } else cur += ch;
  }
  parts.push(cur);
  const scalar = s => /^-?\d+$/.test(s) ? Number(s) : /^(['"]).*\1$/.test(s) ? s.slice(1, -1) : s;
  return Object.fromEntries(parts.map(part => {
    const i = part.indexOf(':');
    if (i < 0) fail(`functions/config/zones.yaml:${lineNo}: "key: value"가 아니에요: ${part.trim()}`);
    const key = part.slice(0, i).trim(), value = part.slice(i + 1).trim();
    return [key, value.startsWith('[') ? value.slice(1, -1).split(',').map(s => scalar(s.trim())).filter(s => s !== '') : scalar(value)];
  }));
}

// ---------- 검증·병합 ----------
function buildZones(yamlZones, layout, shuttle, tokens) {
  const ids = new Set();
  const zones = yamlZones.map(z => {
    for (const key of ['id', 'terminal', 'category', 'name', 'order', 'active_from']) if (z[key] === undefined) fail(`zones.yaml ${z.id ?? '?'}: ${key} 없음`);
    if (ids.has(z.id)) fail(`zones.yaml: id 중복 ${z.id}`);
    ids.add(z.id);
    if (!TERMINALS.includes(z.terminal)) fail(`zones.yaml ${z.id}: terminal ${z.terminal}`);
    if (!(z.category in CATEGORIES)) fail(`zones.yaml ${z.id}: category ${z.category}`);
    if (!Number.isInteger(z.order)) fail(`zones.yaml ${z.id}: order ${z.order}`);
    const short = layout.shortNames[z.id];
    if (!short) fail(`layout.json shortNames: ${z.id} 없음`);
    return { id: z.id, terminal: z.terminal, category: z.category, name: z.name, short, order: z.order, activeFrom: String(z.active_from) };
  });
  for (const id of Object.keys(layout.shortNames)) if (!ids.has(id)) fail(`layout.json shortNames: zones.yaml에 없는 ${id}`);

  const seenCats = layout.groups.flatMap(g => g.categories);
  if (seenCats.length !== Object.keys(CATEGORIES).length || !Object.keys(CATEGORIES).every(c => seenCats.includes(c))) fail('layout.json groups: 구역 종류(단기·장기·타워·예약)는 한 그룹에 한 번씩');

  const routeIds = new Set(shuttle.routes.map(r => r.id));
  const terminals = {};
  for (const t of TERMINALS) {
    const L = withoutComments(layout.terminals[t] ?? fail(`layout.json terminals.${t} 없음`));
    const of = (...cats) => zones.filter(z => z.terminal === t && cats.includes(z.category)).map(z => z.id);
    const sameSet = (list, expected, what) => {
      if (list.length !== new Set(list).size || list.length !== expected.length || !expected.every(id => list.includes(id))) fail(`layout.json ${t}.${what}: ${expected.join(', ')}을(를) 한 번씩 담아야 해요`);
    };
    sameSet(L.floors, of('단기'), 'floors');
    if (!L.floors.slice(0, -1).includes(L.groundAfter)) fail(`layout.json ${t}.groundAfter: 마지막이 아닌 floors 항목이어야 해요`);
    sameSet(L.tiles.map(x => x.id), of('장기', '타워', '예약'), 'tiles');
    let col = 0;
    for (const tile of L.tiles) {
      if (tile.span !== 1 && tile.span !== 2) fail(`layout.json ${t}.tiles ${tile.id}: span은 1 또는 2`);
      if (tile.span === 2 && col !== 0) fail(`layout.json ${t}.tiles ${tile.id}: span 2는 줄 처음에만`);
      col = (col + tile.span) % 2;
    }
    if (col !== 0) fail(`layout.json ${t}.tiles: 2열 그리드 마지막 줄이 비어 있어요`);
    sameSet(L.long, of('장기', '타워'), 'long');
    sameSet([L.reserved], of('예약'), 'reserved');
    for (const r of L.shuttleRoutes) {
      if (!routeIds.has(r)) fail(`layout.json ${t}.shuttleRoutes: shuttle.json에 없는 노선 ${r}`);
      if (!tokens.shuttleRoutes[r]) fail(`tokens.json shuttleRoutes: ${r} 색 없음`);
    }
    terminals[t] = L;
  }
  return { zones, groups: withoutComments(layout.groups), terminals };
}

// ---------- 색 ----------
function parseColor(text) {
  let m = text.match(/^#([0-9a-f]{6})$/i);
  if (m) return { r: parseInt(m[1].slice(0, 2), 16), g: parseInt(m[1].slice(2, 4), 16), b: parseInt(m[1].slice(4, 6), 16), a: 1 };
  m = text.match(/^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/);
  if (m) return { r: +m[1], g: +m[2], b: +m[3], a: +m[4] };
  return fail(`색 형식 오류: ${text}`);
}
const hex2 = n => n.toString(16).toUpperCase().padStart(2, '0');
const argb = c => `0x${hex2(Math.round(c.a * 255))}${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}`;
// 디자인 H.mix와 같은 계산: 채널별 color×w + base×(1−w), 반올림
const mix = (color, { base, weight }) => {
  const a = parseColor(color), b = parseColor(base), ch = k => Math.max(0, Math.min(255, Math.round(a[k] * weight + b[k] * (1 - weight))));
  return { r: ch('r'), g: ch('g'), b: ch('b'), a: 1 };
};

function checkTokens(tokens) {
  const bands = tokens.bands;
  bands.forEach((b, i) => { if (i && b.min >= bands[i - 1].min) fail('tokens.json bands: min 내림차순이어야 해요'); parseColor(b.color); });
  if (bands.at(-1).min !== 0) fail('tokens.json bands: 마지막 min은 0');
  if (!bands.some(b => b.min === tokens.fullThreshold)) fail('tokens.json fullThreshold: bands 경계 중 하나여야 해요');
  const keys = Object.keys(withoutComments(tokens.themes.light));
  if (JSON.stringify(keys) !== JSON.stringify(Object.keys(withoutComments(tokens.themes.dark)))) fail('tokens.json themes: light·dark 키가 같아야 해요');
  for (const theme of Object.values(tokens.themes)) Object.values(theme).forEach(parseColor);
  return keys;
}

// ---------- 코드 공통 ----------
const dbl = n => Number.isInteger(n) ? n.toFixed(1) : String(n);
const swiftStr = s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`;
const ktStr = s => `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\$/g, '\\$').replace(/\n/g, '\\n')}"`;
const pascal = s => s[0].toUpperCase() + s.slice(1);
const upperSnake = s => s.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
const RESERVED = new Set(['as', 'break', 'case', 'class', 'continue', 'default', 'do', 'else', 'enum', 'false', 'for', 'fun', 'func', 'if', 'import', 'in', 'is', 'let', 'nil', 'null', 'object', 'package', 'private', 'public', 'return', 'self', 'static', 'struct', 'super', 'switch', 'this', 'throw', 'true', 'try', 'typealias', 'val', 'var', 'when', 'where', 'while']);
const ident = (name, where) => {
  if (!/^[a-z][A-Za-z0-9]*$/.test(name) || RESERVED.has(name)) fail(`${where}: "${name}"는 Swift·Kotlin 이름으로 쓸 수 없어요(lowerCamel, 예약어 제외)`);
  return name;
};

// ---------- Tokens ----------
function swiftTokens(tokens, themeKeys) {
  const palette = name => {
    const t = tokens.themes[name];
    return `    public static let ${name} = ThemePalette(\n${themeKeys.map(k => `        ${k}: TokenColor(${argb(parseColor(t[k]))})`).join(',\n')}\n    )`;
  };
  const bands = tokens.bands;
  const sw = (fn, indent = '        ') => bands.map(b => `${indent}case .${b.id}: return ${fn(b)}`).join('\n');
  const theme = (kind, b) => `theme == .dark ? TokenColor(${argb(mix(b.color, tokens.mix[kind].dark))}) : TokenColor(${argb(mix(b.color, tokens.mix[kind].light))})`;
  const shadow = s => { const c = parseColor(s.color); return `Shadow(x: ${s.x}, y: ${s.y}, blur: ${s.blur}, color: TokenColor(${argb(c)}))`; };
  const routes = Object.entries(tokens.shuttleRoutes);
  return `${SWIFT_HEADER(`${SHARED}/tokens.json`)}
/// 0xAARRGGBB
public struct TokenColor: Hashable, Sendable {
    public let argb: UInt32
    public init(_ argb: UInt32) { self.argb = argb }
    public var alpha: Double { Double((argb >> 24) & 0xFF) / 255 }
    public var red: Double { Double((argb >> 16) & 0xFF) / 255 }
    public var green: Double { Double((argb >> 8) & 0xFF) / 255 }
    public var blue: Double { Double(argb & 0xFF) / 255 }
}

public enum ThemeMode: String, CaseIterable, Sendable {
    case light, dark
}

public struct ThemePalette: Hashable, Sendable {
${themeKeys.map(k => `    public let ${k}: TokenColor`).join('\n')}
}

/// 혼잡 단계. 경계는 웹 occupancy.js bands와 같고 점유율이 경계 이상이면 그 단계.
public enum OccupancyBand: String, CaseIterable, Sendable {
    case ${bands.map(b => b.id).join(', ')}

    public static func of(_ occupancy: Double) -> OccupancyBand {
${bands.slice(0, -1).map(b => `        if occupancy >= ${dbl(b.min)} { return .${b.id} }`).join('\n')}
        return .${bands.at(-1).id}
    }

    public var label: String {
        switch self {
${sw(b => swiftStr(b.label))}
        }
    }

    public var minimum: Double {
        switch self {
${sw(b => dbl(b.min))}
        }
    }

    public var color: TokenColor {
        switch self {
${sw(b => `TokenColor(${argb(parseColor(b.color))})`)}
        }
    }

    /// 칸 배경
    public func tint(_ theme: ThemeMode) -> TokenColor {
        switch self {
${sw(b => theme('tint', b))}
        }
    }

    /// 슬래브·타워 두께
    public func edge(_ theme: ThemeMode) -> TokenColor {
        switch self {
${sw(b => theme('edge', b))}
        }
    }
}

public struct ShuttleRouteColor: Hashable, Sendable {
    public let color: TokenColor
    let softLight: TokenColor
    let softDark: TokenColor
    /// 카드·선택 행 배경
    public func soft(_ theme: ThemeMode) -> TokenColor { theme == .dark ? softDark : softLight }
}

public struct Shadow: Hashable, Sendable {
    public let x: Double
    public let y: Double
    public let blur: Double
    public let color: TokenColor
}

public enum Tokens {
    public static let fullThreshold = ${dbl(tokens.fullThreshold)}

${palette('light')}

${palette('dark')}

    public static func palette(_ theme: ThemeMode) -> ThemePalette { theme == .dark ? dark : light }

    /// 상단 줄 범례 그라데이션: 각 점유율의 tint를 차례로
    public static let legendStops: [Double] = [${tokens.legendStops.map(dbl).join(', ')}]

    public static let shuttleRoutes: [String: ShuttleRouteColor] = [
${routes.map(([id, c]) => `        ${swiftStr(id)}: ShuttleRouteColor(color: TokenColor(${argb(parseColor(c))}), softLight: TokenColor(${argb(mix(c, tokens.mix.shuttleSoft.light))}), softDark: TokenColor(${argb(mix(c, tokens.mix.shuttleSoft.dark))}))`).join(',\n')}
    ]

    public enum Spacing {
${tokens.spacing.map(n => `        public static let s${n}: Double = ${n}`).join('\n')}
    }

    public enum Radius {
${Object.entries(tokens.radius).map(([k, n]) => `        public static let ${k}: Double = ${n}`).join('\n')}
    }

${Object.entries(tokens.shadows).map(([k, s]) => `    public static let ${k}Shadow = ${shadow(s)}`).join('\n')}
}
`;
}

function kotlinTokens(tokens, themeKeys) {
  const palette = name => {
    const t = tokens.themes[name];
    return `    val ${name} = ThemePalette(\n${themeKeys.map(k => `        ${k} = TokenColor(${argb(parseColor(t[k]))}L)`).join(',\n')},\n    )`;
  };
  const c = color => `TokenColor(${argb(color)}L)`;
  const routes = Object.entries(tokens.shuttleRoutes);
  return `${SWIFT_HEADER(`${SHARED}/tokens.json`)}package ${KOTLIN_PACKAGE}

/** 0xAARRGGBB */
@JvmInline
value class TokenColor(val argb: Long) {
    val alpha: Float get() = ((argb shr 24) and 0xFF).toFloat() / 255f
    val red: Float get() = ((argb shr 16) and 0xFF).toFloat() / 255f
    val green: Float get() = ((argb shr 8) and 0xFF).toFloat() / 255f
    val blue: Float get() = (argb and 0xFF).toFloat() / 255f
}

enum class ThemeMode { LIGHT, DARK }

data class ThemePalette(
${themeKeys.map(k => `    val ${k}: TokenColor,`).join('\n')}
)

/** 혼잡 단계. 경계는 웹 occupancy.js bands와 같고 점유율이 경계 이상이면 그 단계. */
enum class OccupancyBand(
    val id: String,
    val label: String,
    val minimum: Double,
    val color: TokenColor,
    private val tintLight: TokenColor,
    private val tintDark: TokenColor,
    private val edgeLight: TokenColor,
    private val edgeDark: TokenColor,
) {
${tokens.bands.map(b => `    ${upperSnake(b.id)}(${ktStr(b.id)}, ${ktStr(b.label)}, ${dbl(b.min)}, ${c(parseColor(b.color))}, ${c(mix(b.color, tokens.mix.tint.light))}, ${c(mix(b.color, tokens.mix.tint.dark))}, ${c(mix(b.color, tokens.mix.edge.light))}, ${c(mix(b.color, tokens.mix.edge.dark))}),`).join('\n')}
    ;

    /** 칸 배경 */
    fun tint(theme: ThemeMode): TokenColor = if (theme == ThemeMode.DARK) tintDark else tintLight

    /** 슬래브·타워 두께 */
    fun edge(theme: ThemeMode): TokenColor = if (theme == ThemeMode.DARK) edgeDark else edgeLight

    companion object {
        fun of(occupancy: Double): OccupancyBand = entries.firstOrNull { occupancy >= it.minimum } ?: ${upperSnake(tokens.bands.at(-1).id)}
    }
}

data class ShuttleRouteColor(
    val color: TokenColor,
    private val softLight: TokenColor,
    private val softDark: TokenColor,
) {
    /** 카드·선택 행 배경 */
    fun soft(theme: ThemeMode): TokenColor = if (theme == ThemeMode.DARK) softDark else softLight
}

data class Shadow(val x: Float, val y: Float, val blur: Float, val color: TokenColor)

object Tokens {
    const val FULL_THRESHOLD = ${dbl(tokens.fullThreshold)}

${palette('light')}

${palette('dark')}

    fun palette(theme: ThemeMode): ThemePalette = if (theme == ThemeMode.DARK) dark else light

    /** 상단 줄 범례 그라데이션: 각 점유율의 tint를 차례로 */
    val legendStops: List<Double> = listOf(${tokens.legendStops.map(dbl).join(', ')})

    val shuttleRoutes: Map<String, ShuttleRouteColor> = mapOf(
${routes.map(([id, col]) => `        ${ktStr(id)} to ShuttleRouteColor(${c(parseColor(col))}, ${c(mix(col, tokens.mix.shuttleSoft.light))}, ${c(mix(col, tokens.mix.shuttleSoft.dark))}),`).join('\n')}
    )

    object Spacing {
${tokens.spacing.map(n => `        const val S${n} = ${n}f`).join('\n')}
    }

    object Radius {
${Object.entries(tokens.radius).map(([k, n]) => `        const val ${upperSnake(k)} = ${n}f`).join('\n')}
    }

${Object.entries(tokens.shadows).map(([k, s]) => `    val ${k}Shadow = Shadow(${s.x}f, ${s.y}f, ${s.blur}f, ${c(parseColor(s.color))})`).join('\n')}
}
`;
}

// ---------- Strings ----------
const placeholders = (text, where) => [...new Set([...text.matchAll(/\{([^}]*)\}/g)].map(m => ident(m[1], where)))];

function swiftStrings(node, name, indent, path) {
  const pad = '    '.repeat(indent);
  const lines = [`${pad}public enum ${name} {`];
  for (const [key, value] of Object.entries(node)) {
    if (key === '$comment') continue;
    const where = `strings.ko.json ${[...path, key].join('.')}`;
    if (typeof value === 'string') {
      const params = placeholders(value, where);
      ident(key, where);
      if (!params.length) lines.push(`${pad}    public static let ${key} = ${swiftStr(value)}`);
      else {
        const body = swiftStr(value).replace(/\{([a-zA-Z0-9]+)\}/g, '\\($1)');
        lines.push(`${pad}    public static func ${key}(${params.map(p => `${p}: String`).join(', ')}) -> String { ${body} }`);
      }
    } else if (Array.isArray(value)) {
      lines.push(`${pad}    public static let ${ident(key, where)}: [String] = [${value.map(swiftStr).join(', ')}]`);
    } else lines.push(...swiftStrings(value, pascal(ident(key, where)), indent + 1, [...path, key]));
  }
  lines.push(`${pad}}`);
  return lines;
}

function kotlinStrings(node, name, indent, path) {
  const pad = '    '.repeat(indent);
  const lines = [`${pad}object ${name} {`];
  for (const [key, value] of Object.entries(node)) {
    if (key === '$comment') continue;
    const where = `strings.ko.json ${[...path, key].join('.')}`;
    if (typeof value === 'string') {
      const params = placeholders(value, where);
      ident(key, where);
      if (!params.length) lines.push(`${pad}    const val ${key} = ${ktStr(value)}`);
      else {
        const body = ktStr(value).replace(/\{([a-zA-Z0-9]+)\}/g, '${$1}');
        lines.push(`${pad}    fun ${key}(${params.map(p => `${p}: String`).join(', ')}): String = ${body}`);
      }
    } else if (Array.isArray(value)) {
      lines.push(`${pad}    val ${ident(key, where)}: List<String> = listOf(${value.map(ktStr).join(', ')})`);
    } else lines.push(...kotlinStrings(value, pascal(ident(key, where)), indent + 1, [...path, key]));
  }
  lines.push(`${pad}}`);
  return lines;
}

// ---------- Android 리소스 문자열 ----------
// 매니페스트·위젯 정보 XML은 Kotlin 상수를 못 쓰므로 자리표시자 없는 문구를 values/strings.xml로도 낸다. 이름 = 경로_키(예: widget_galleryName)
function androidStringsXml(node) {
  const out = [];
  const walk = (n, path) => {
    for (const [key, value] of Object.entries(n)) {
      if (key === '$comment') continue;
      if (typeof value === 'string') { if (!/\{[a-zA-Z0-9]+\}/.test(value)) out.push([[...path, key].join('_'), value]); }
      else if (!Array.isArray(value)) walk(value, [...path, key]);
    }
  };
  walk(node, []);
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/"/g, '\\"').replace(/\n/g, '\\n').replace(/^([@?])/, '\\$1');
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- 생성 파일 — 직접 고치지 마세요. 원본: ${SHARED}/strings.ko.json · node mobile/shared/scripts/generate.mjs -->\n<resources>\n${out.map(([k, v]) => `    <string name="${k}" formatted="false">${esc(v)}</string>`).join('\n')}\n</resources>\n`;
}

// ---------- Zones ----------
function swiftZones({ zones, groups, terminals }) {
  const cat = c => `.${CATEGORIES[c]}`;
  const list = ids => `[${ids.map(swiftStr).join(', ')}]`;
  const sw = fn => groups.map(g => `        case .${g.id}: return ${fn(g)}`).join('\n');
  return `${SWIFT_HEADER(`functions/config/zones.yaml + ${SHARED}/layout.json`)}
public enum Terminal: String, CaseIterable, Sendable {
${TERMINALS.map(t => `    case ${t.toLowerCase()} = ${swiftStr(t)}`).join('\n')}
}

/// zones.yaml·latest.json의 category 값
public enum ZoneCategory: String, CaseIterable, Sendable {
${Object.entries(CATEGORIES).map(([ko, id]) => `    case ${id} = ${swiftStr(ko)}`).join('\n')}

    public var group: ZoneGroup {
        switch self {
${Object.entries(CATEGORIES).map(([ko, id]) => `        case .${id}: return .${groups.find(g => g.categories.includes(ko)).id}`).join('\n')}
        }
    }
}

/// 실시간 그룹·히스토리 그룹. inTotal = 터미널 전체 합계에 포함
public enum ZoneGroup: String, CaseIterable, Sendable {
    case ${groups.map(g => g.id).join(', ')}

    public var label: String {
        switch self {
${sw(g => swiftStr(g.label))}
        }
    }

    public var categories: [ZoneCategory] {
        switch self {
${sw(g => `[${g.categories.map(cat).join(', ')}]`)}
        }
    }

    public var inTotal: Bool {
        switch self {
${sw(g => String(g.inTotal))}
        }
    }
}

public struct ZoneDef: Hashable, Sendable {
    public let id: String
    public let terminal: Terminal
    public let category: ZoneCategory
    public let name: String
    public let shortName: String
    public let order: Int
    public let activeFrom: String
}

public struct ZoneTile: Hashable, Sendable {
    public let id: String
    public let span: Int
}

public struct TerminalLayout: Hashable, Sendable {
    /// 단기 층, 위에서부터 건물 층 순
    public let floors: [String]
    /// 이 층 행 아래에 지면선
    public let groundAfter: String
    /// 장기·타워·예약 2열 그리드 순서
    public let tiles: [ZoneTile]
    /// 예측 표·히스토리 칩의 장기·타워 순서
    public let long: [String]
    public let reserved: String
    /// 셔틀 노선 칸 순서(첫 노선 = 기본)
    public let shuttleRoutes: [String]
}

public enum Zones {
    public static let all: [ZoneDef] = [
${zones.map(z => `        ZoneDef(id: ${swiftStr(z.id)}, terminal: .${z.terminal.toLowerCase()}, category: ${cat(z.category)}, name: ${swiftStr(z.name)}, shortName: ${swiftStr(z.short)}, order: ${z.order}, activeFrom: ${swiftStr(z.activeFrom)})`).join(',\n')}
    ]

    public static let byId: [String: ZoneDef] = Dictionary(uniqueKeysWithValues: all.map { ($0.id, $0) })

    public static func zones(_ terminal: Terminal) -> [ZoneDef] { all.filter { $0.terminal == terminal } }

    public static func layout(_ terminal: Terminal) -> TerminalLayout {
        switch terminal {
${TERMINALS.map(t => { const L = terminals[t]; return `        case .${t.toLowerCase()}:
            return TerminalLayout(
                floors: ${list(L.floors)},
                groundAfter: ${swiftStr(L.groundAfter)},
                tiles: [${L.tiles.map(x => `ZoneTile(id: ${swiftStr(x.id)}, span: ${x.span})`).join(', ')}],
                long: ${list(L.long)},
                reserved: ${swiftStr(L.reserved)},
                shuttleRoutes: ${list(L.shuttleRoutes)}
            )`; }).join('\n')}
        }
    }
}
`;
}

function kotlinZones({ zones, groups, terminals }) {
  const cat = c => `ZoneCategory.${upperSnake(CATEGORIES[c])}`;
  const list = ids => `listOf(${ids.map(ktStr).join(', ')})`;
  return `${SWIFT_HEADER(`functions/config/zones.yaml + ${SHARED}/layout.json`)}package ${KOTLIN_PACKAGE}

enum class Terminal(val code: String) {
${TERMINALS.map(t => `    ${t}(${ktStr(t)}),`).join('\n')}
    ;

    companion object {
        fun fromCode(code: String): Terminal? = entries.firstOrNull { it.code == code }
    }
}

/** zones.yaml·latest.json의 category 값 */
enum class ZoneCategory(val label: String) {
${Object.entries(CATEGORIES).map(([ko, id]) => `    ${upperSnake(id)}(${ktStr(ko)}),`).join('\n')}
    ;

    val group: ZoneGroup
        get() = when (this) {
${Object.entries(CATEGORIES).map(([ko, id]) => `            ${upperSnake(id)} -> ZoneGroup.${upperSnake(groups.find(g => g.categories.includes(ko)).id)}`).join('\n')}
        }

    companion object {
        fun fromLabel(label: String): ZoneCategory? = entries.firstOrNull { it.label == label }
    }
}

/** 실시간 그룹·히스토리 그룹. inTotal = 터미널 전체 합계에 포함 */
enum class ZoneGroup(val id: String, val label: String, val categories: List<ZoneCategory>, val inTotal: Boolean) {
${groups.map(g => `    ${upperSnake(g.id)}(${ktStr(g.id)}, ${ktStr(g.label)}, listOf(${g.categories.map(cat).join(', ')}), ${g.inTotal}),`).join('\n')}
}

data class ZoneDef(
    val id: String,
    val terminal: Terminal,
    val category: ZoneCategory,
    val name: String,
    val shortName: String,
    val order: Int,
    val activeFrom: String,
)

data class ZoneTile(val id: String, val span: Int)

data class TerminalLayout(
    /** 단기 층, 위에서부터 건물 층 순 */
    val floors: List<String>,
    /** 이 층 행 아래에 지면선 */
    val groundAfter: String,
    /** 장기·타워·예약 2열 그리드 순서 */
    val tiles: List<ZoneTile>,
    /** 예측 표·히스토리 칩의 장기·타워 순서 */
    val long: List<String>,
    val reserved: String,
    /** 셔틀 노선 칸 순서(첫 노선 = 기본) */
    val shuttleRoutes: List<String>,
)

object Zones {
    val all: List<ZoneDef> = listOf(
${zones.map(z => `        ZoneDef(${ktStr(z.id)}, Terminal.${z.terminal}, ${cat(z.category)}, ${ktStr(z.name)}, ${ktStr(z.short)}, ${z.order}, ${ktStr(z.activeFrom)}),`).join('\n')}
    )

    val byId: Map<String, ZoneDef> = all.associateBy { it.id }

    fun zones(terminal: Terminal): List<ZoneDef> = all.filter { it.terminal == terminal }

    fun layout(terminal: Terminal): TerminalLayout = when (terminal) {
${TERMINALS.map(t => { const L = terminals[t]; return `        Terminal.${t} -> TerminalLayout(
            floors = ${list(L.floors)},
            groundAfter = ${ktStr(L.groundAfter)},
            tiles = listOf(${L.tiles.map(x => `ZoneTile(${ktStr(x.id)}, ${x.span})`).join(', ')}),
            long = ${list(L.long)},
            reserved = ${ktStr(L.reserved)},
            shuttleRoutes = ${list(L.shuttleRoutes)},
        )`; }).join('\n')}
    }
}
`;
}

// ---------- 실행 ----------
export function generate() {
  const tokens = readJson(`${SHARED}/tokens.json`);
  const strings = readJson(`${SHARED}/strings.ko.json`);
  const layout = readJson(`${SHARED}/layout.json`);
  const shuttleText = read('web/shuttle.json');
  const shuttle = JSON.parse(shuttleText);
  const themeKeys = checkTokens(tokens);
  for (const k of themeKeys) ident(k, 'tokens.json themes');
  const model = buildZones(parseZonesYaml(read('functions/config/zones.yaml')), layout, shuttle, tokens);
  const zonesJson = { $comment: '생성 파일 — functions/config/zones.yaml + mobile/shared/layout.json. node mobile/shared/scripts/generate.mjs', version: 1, ...model };
  const kotlinStringsFile = `${SWIFT_HEADER(`${SHARED}/strings.ko.json`)}package ${KOTLIN_PACKAGE}\n\n${kotlinStrings(strings, 'Strings', 0, []).join('\n')}\n`;
  return new Map([
    [`${SHARED}/zones.json`, JSON.stringify(zonesJson, null, 2) + '\n'],
    [`${SHARED}/shuttle.json`, shuttleText],
    [`${IOS_OUT}/Tokens.swift`, swiftTokens(tokens, themeKeys)],
    [`${IOS_OUT}/Strings.swift`, `${SWIFT_HEADER(`${SHARED}/strings.ko.json`)}\n${swiftStrings(strings, 'Strings', 0, []).join('\n')}\n`],
    [`${IOS_OUT}/Zones.swift`, swiftZones(model)],
    [`${KOTLIN_OUT}/Tokens.kt`, kotlinTokens(tokens, themeKeys)],
    [`${KOTLIN_OUT}/Strings.kt`, kotlinStringsFile],
    [`${KOTLIN_OUT}/Zones.kt`, kotlinZones(model)],
    ['mobile/android/core/src/main/res/values/strings.xml', androidStringsXml(strings)],
    // 앱 이름도 strings.ko.json 한 곳에서: iOS Info.plist CFBundleDisplayName = $(APP_DISPLAY_NAME)
    ['mobile/ios/Config/Generated.xcconfig', `// 생성 파일 — 직접 고치지 마세요. 원본: ${SHARED}/strings.ko.json · node mobile/shared/scripts/generate.mjs\nAPP_DISPLAY_NAME = ${strings.app.name}\n`],
  ]);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  try {
    const outputs = generate();
    const stale = [];
    for (const [path, content] of outputs) {
      const full = join(ROOT, path);
      const same = existsSync(full) && readFileSync(full, 'utf8') === content;
      if (same) continue;
      if (check) { stale.push(path); continue; }
      mkdirSync(dirname(full), { recursive: true });
      writeFileSync(full, content);
      console.log(`wrote ${relative(ROOT, full)}`);
    }
    if (stale.length) {
      console.error(`생성 파일이 원본과 달라요. node mobile/shared/scripts/generate.mjs 를 실행하세요:\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    if (check) console.log('mobile/shared 생성 파일 최신');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
