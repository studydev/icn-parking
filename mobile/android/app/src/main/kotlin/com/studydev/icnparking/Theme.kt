package com.studydev.icnparking

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.studydev.icnparking.core.generated.OccupancyBand
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.ThemeMode
import com.studydev.icnparking.core.generated.ThemePalette
import com.studydev.icnparking.core.generated.TokenColor
import com.studydev.icnparking.core.generated.Tokens

fun TokenColor.toColor(): Color = Color(argb)

/** README 토큰표(라이트/다크). 화면은 이 값만 쓴다(iOS Theme와 같은 역할) */
class Theme(val mode: ThemeMode) {
    val p: ThemePalette = Tokens.palette(mode)
    fun tint(occupancy: Double): Color = OccupancyBand.of(occupancy).tint(mode).toColor()
    fun edge(occupancy: Double): Color = OccupancyBand.of(occupancy).edge(mode).toColor()
    fun deltaColor(d: Int): Color = when {
        d > 0 -> p.up.toColor()
        d < 0 -> p.down.toColor()
        else -> p.muted.toColor()
    }
}

val LocalTheme = staticCompositionLocalOf { Theme(ThemeMode.LIGHT) }

@Composable
fun ParkingTheme(dark: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val theme = Theme(if (dark) ThemeMode.DARK else ThemeMode.LIGHT)
    val t = theme.p
    val scheme = (if (dark) darkColorScheme() else lightColorScheme()).copy(
        primary = t.tint.toColor(),
        secondaryContainer = t.tonal.toColor(),
        background = t.bg.toColor(),
        onBackground = t.ink.toColor(),
        surface = t.bg.toColor(),
        onSurface = t.ink.toColor(),
        onSurfaceVariant = t.muted.toColor(),
        surfaceContainer = t.chip.toColor(),
        surfaceContainerLow = t.sheet.toColor(),
        outline = t.outline.toColor(),
        outlineVariant = t.line.toColor(),
        error = t.up.toColor(),
    )
    CompositionLocalProvider(LocalTheme provides theme) {
        MaterialTheme(colorScheme = scheme, content = content)
    }
}

/** 배치도·표는 글자 크기 설정과 상관없이 고정(README Accessibility: Dynamic Type은 헤더·목록·설정만) */
@Composable
fun fs(size: Float): TextUnit = with(LocalDensity.current) { size.dp.toSp() }

@Composable
fun style(size: Float, weight: FontWeight = FontWeight.Normal, color: Color = Color.Unspecified, tabular: Boolean = false): TextStyle =
    TextStyle(fontSize = fs(size), fontWeight = weight, color = color, fontFeatureSettings = if (tabular) "tnum" else null)

/** 글자 크기 설정을 따르는 글꼴(README Accessibility: 헤더·목록·설정만 확대) */
@Composable
fun styleS(size: Float, weight: FontWeight = FontWeight.Normal, color: Color = Color.Unspecified, tabular: Boolean = false): TextStyle =
    style(size, weight, color, tabular).copy(fontSize = size.sp)

/** 디자인 Android 세그먼트: 외곽선 높이 34, 좌우 11, 선택 배경 tonal, 체크 표시 없음(wide = 설정 전체 폭 40, 선택 ✓) */
@Composable
fun <T> Segmented(items: List<Pair<T, String>>, selected: T, onSelect: (T) -> Unit, wide: Boolean = false, modifier: Modifier = Modifier) {
    val theme = LocalTheme.current
    Row(modifier) {
        items.forEachIndexed { i, (value, label) ->
            val on = value == selected
            val shape = when {
                items.size == 1 -> RoundedCornerShape(17.dp)
                i == 0 -> RoundedCornerShape(topStart = 17.dp, bottomStart = 17.dp)
                i == items.lastIndex -> RoundedCornerShape(topEnd = 17.dp, bottomEnd = 17.dp)
                else -> RoundedCornerShape(0.dp)
            }
            Box(
                Modifier
                    .then(if (wide) Modifier.weight(1f) else Modifier)
                    .offset(x = (-i).dp)
                    .height(if (wide) 40.dp else 34.dp)
                    .clip(shape)
                    .background(if (on) theme.p.tonal.toColor() else Color.Transparent)
                    .border(BorderStroke(1.dp, theme.p.outline.toColor()), shape)
                    .clickable { onSelect(value) }
                    .semantics { this.selected = on }
                    .padding(horizontal = if (wide) 0.dp else 11.dp),
                contentAlignment = Alignment.Center,
            ) {
                Text((if (wide && on) "✓ " else "") + label, style = style(if (wide) 14f else 13f, FontWeight.Bold, theme.p.ink.toColor()), maxLines = 1)
            }
        }
    }
}

/** 상단 줄 범례: 여유 ▭ 만차 */
@Composable
fun LegendScale() {
    val theme = LocalTheme.current
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.semantics(mergeDescendants = true) { contentDescription = Strings.Meta.legendA11y }) {
        val s = style(11f, FontWeight.SemiBold)
        Text(Strings.Meta.legendLow, style = s)
        Box(Modifier.size(36.dp, 6.dp).clip(RoundedCornerShape(3.dp)).background(Brush.horizontalGradient(Tokens.legendStops.map { theme.tint(it) })))
        Text(Strings.Meta.legendHigh, style = s)
    }
}

/** 지면선 */
@Composable
fun GroundLine() {
    val theme = LocalTheme.current
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        Box(Modifier.weight(1f).height(2.dp).background(theme.p.outline.toColor()))
        Text(Strings.Zone.ground, style = style(10.5f, FontWeight.Bold, theme.p.muted.toColor()))
        Box(Modifier.weight(1f).height(2.dp).background(theme.p.outline.toColor()))
    }
}

@Composable
fun HSpace(width: Float) = Spacer(Modifier.width(width.dp))
