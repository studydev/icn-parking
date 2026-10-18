#!/usr/bin/env node
// 앱 아이콘 원본: P + 이륙하는 비행기. 모양은 여기 한 곳에만 둔다.
//   node mobile/shared/scripts/icon.mjs   → mobile/shared/brand/icon.svg(iOS PNG 원본) + Android 적응형 아이콘 벡터
// iOS PNG(1024)는 macOS 기본 Quick Look으로 렌더한다: mobile/shared/scripts/icon-ios.sh
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const tokens = JSON.parse((await import('node:fs')).readFileSync(join(ROOT, 'mobile/shared/tokens.json'), 'utf8'));

// 1024 좌표. 배경 = 브랜드 tint(라이트), 마크 = 흰색
export const BG = tokens.themes.light.tint;
export const BG_DEEP = tokens.themes.light.down;
const P = 'M230 260H500A185 185 0 0 1 500 630H360V800H230Z M360 385H490A60 60 0 0 1 490 505H360Z';
// 위에서 본 비행기(코가 +x), 원점 중심 길이 300
const PLANE = [
  'M150 0C150 -16 130 -24 110 -24H-120C-135 -24 -150 -14 -150 0C-150 14 -135 24 -120 24H110C130 24 150 16 150 0Z',
  'M50 -20L-40 -170L-75 -170L-20 -20Z',
  'M50 20L-40 170L-75 170L-20 20Z',
  'M-100 -20L-140 -80L-160 -80L-140 -20Z',
  'M-100 20L-140 80L-160 80L-140 20Z',
];
// 비행기 위치: P 어깨에서 오른쪽 위로 35° 이륙
const PLANE_TRANSFORM = { x: 815, y: 265, rotate: -35, scale: 0.78 };
// 마크 전체를 가운데로(P+비행기 묶음 중심 x≈570 → 512)
const MARK_SHIFT = -55;

function svg() {
  const t = PLANE_TRANSFORM;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <!-- 생성 파일 — mobile/shared/scripts/icon.mjs -->
  <defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${BG}"/><stop offset="1" stop-color="${BG_DEEP}"/></linearGradient></defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <g fill="#ffffff" transform="translate(${MARK_SHIFT} 0)">
    <path fill-rule="evenodd" d="${P}"/>
    <g transform="translate(${t.x} ${t.y}) rotate(${t.rotate}) scale(${t.scale})">
${PLANE.map(d => `      <path d="${d}"/>`).join('\n')}
    </g>
  </g>
</svg>
`;
}

/** Android 적응형 아이콘 전경(108dp). 원형 마스크 안전 영역(지름 66dp) 안에 마크 끝(비행기 코, 중심에서 466)이 들어가도록 0.64배 */
function vector(color) {
  const t = PLANE_TRANSFORM, s = 0.64, c = 512;
  return `<?xml version="1.0" encoding="utf-8"?>
<!-- 생성 파일 — mobile/shared/scripts/icon.mjs -->
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="108dp"
    android:height="108dp"
    android:viewportWidth="1024"
    android:viewportHeight="1024">
    <group android:pivotX="${c}" android:pivotY="${c}" android:scaleX="${s}" android:scaleY="${s}" android:translateX="${MARK_SHIFT * s}">
        <path android:fillColor="${color}" android:fillType="evenOdd" android:pathData="${P}" />
        <group android:translateX="${t.x}" android:translateY="${t.y}" android:rotation="${t.rotate}" android:scaleX="${t.scale}" android:scaleY="${t.scale}">
${PLANE.map(d => `            <path android:fillColor="${color}" android:pathData="${d}" />`).join('\n')}
        </group>
    </group>
</vector>
`;
}

const files = {
  'mobile/shared/brand/icon.svg': svg(),
  'mobile/android/app/src/main/res/drawable/ic_launcher_foreground.xml': vector('#FFFFFF'),
  'mobile/android/app/src/main/res/drawable/ic_launcher_monochrome.xml': vector('#FFFFFF'),
  'mobile/android/app/src/main/res/drawable/ic_launcher_background.xml': `<?xml version="1.0" encoding="utf-8"?>
<!-- 생성 파일 — mobile/shared/scripts/icon.mjs -->
<shape xmlns:android="http://schemas.android.com/apk/res/android">
    <gradient android:angle="270" android:startColor="${BG}" android:endColor="${BG_DEEP}" />
</shape>
`,
  'mobile/android/app/src/main/res/mipmap-anydpi/ic_launcher.xml': `<?xml version="1.0" encoding="utf-8"?>
<!-- 생성 파일 — mobile/shared/scripts/icon.mjs -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@drawable/ic_launcher_background" />
    <foreground android:drawable="@drawable/ic_launcher_foreground" />
    <monochrome android:drawable="@drawable/ic_launcher_monochrome" />
</adaptive-icon>
`,
};
for (const [path, content] of Object.entries(files)) {
  mkdirSync(dirname(join(ROOT, path)), { recursive: true });
  writeFileSync(join(ROOT, path), content);
  console.log(`wrote ${path}`);
}
