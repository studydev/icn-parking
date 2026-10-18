// 생성 파일 — 직접 고치지 마세요.
// 원본: mobile/shared/tokens.json · node mobile/shared/scripts/generate.mjs
package com.studydev.icnparking.core.generated

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
    val bg: TokenColor,
    val surface: TokenColor,
    val sheet: TokenColor,
    val ink: TokenColor,
    val ink2: TokenColor,
    val muted: TokenColor,
    val faint: TokenColor,
    val line: TokenColor,
    val outline: TokenColor,
    val track: TokenColor,
    val chip: TokenColor,
    val tonal: TokenColor,
    val tint: TokenColor,
    val up: TokenColor,
    val down: TokenColor,
    val fullInk: TokenColor,
    val gS: TokenColor,
    val gSInk: TokenColor,
    val gL: TokenColor,
    val gLInk: TokenColor,
    val stall: TokenColor,
    val wk: TokenColor,
    val band: TokenColor,
    val warnBg: TokenColor,
    val warnInk: TokenColor,
    val warnLine: TokenColor,
    val scrim: TokenColor,
    val thumb: TokenColor,
    val bar: TokenColor,
    val widgetBg: TokenColor,
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
    FULL("full", "만차", 0.98, TokenColor(0xFFE5303FL), TokenColor(0xFFF4A8AEL), TokenColor(0xFF8D252FL), TokenColor(0xFFC52936L), TokenColor(0xFFB32531L)),
    VERY_BUSY("veryBusy", "매우 혼잡", 0.95, TokenColor(0xFFF4622AL), TokenColor(0xFFFABDA6L), TokenColor(0xFF964223L), TokenColor(0xFFD25424L), TokenColor(0xFFBE4C21L)),
    BUSY("busy", "혼잡", 0.9, TokenColor(0xFFF5A524L), TokenColor(0xFFFBD9A3L), TokenColor(0xFF97691FL), TokenColor(0xFFD38E1FL), TokenColor(0xFFBF811CL)),
    NORMAL("normal", "보통", 0.7, TokenColor(0xFF2F80EDL), TokenColor(0xFFA8CAF7L), TokenColor(0xFF245394L), TokenColor(0xFF286ECCL), TokenColor(0xFF2564B9L)),
    FREE("free", "여유", 0.0, TokenColor(0xFF12B76AL), TokenColor(0xFF9BE1C0L), TokenColor(0xFF137348L), TokenColor(0xFF0F9D5BL), TokenColor(0xFF0E8F53L)),
    ;

    /** 칸 배경 */
    fun tint(theme: ThemeMode): TokenColor = if (theme == ThemeMode.DARK) tintDark else tintLight

    /** 슬래브·타워 두께 */
    fun edge(theme: ThemeMode): TokenColor = if (theme == ThemeMode.DARK) edgeDark else edgeLight

    companion object {
        fun of(occupancy: Double): OccupancyBand = entries.firstOrNull { occupancy >= it.minimum } ?: FREE
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
    const val FULL_THRESHOLD = 0.98

    val light = ThemePalette(
        bg = TokenColor(0xFFFFFFFFL),
        surface = TokenColor(0xFFF2F4F7L),
        sheet = TokenColor(0xFFFFFFFFL),
        ink = TokenColor(0xFF111316L),
        ink2 = TokenColor(0xFF2C3137L),
        muted = TokenColor(0xFF5D646CL),
        faint = TokenColor(0xFF8A9199L),
        line = TokenColor(0xFFEAEDF0L),
        outline = TokenColor(0xFFCDD2D8L),
        track = TokenColor(0xFFEEF0F3L),
        chip = TokenColor(0xFFF2F4F6L),
        tonal = TokenColor(0xFFDDE8FFL),
        tint = TokenColor(0xFF2F6FEDL),
        up = TokenColor(0xFFD92D3AL),
        down = TokenColor(0xFF1F5FD6L),
        fullInk = TokenColor(0xFFA1121FL),
        gS = TokenColor(0xFFE3E9F0L),
        gSInk = TokenColor(0xFF2F4256L),
        gL = TokenColor(0xFFF8F0E4L),
        gLInk = TokenColor(0xFF8A5410L),
        stall = TokenColor(0xCCFFFFFFL),
        wk = TokenColor(0xFFFDECEBL),
        band = TokenColor(0xFFF5F7F9L),
        warnBg = TokenColor(0xFFFFF3DCL),
        warnInk = TokenColor(0xFF8A4B00L),
        warnLine = TokenColor(0xFFF7C768L),
        scrim = TokenColor(0x5C101214L),
        thumb = TokenColor(0xFFFFFFFFL),
        bar = TokenColor(0xFFFFFFFFL),
        widgetBg = TokenColor(0xFFEEF3FFL),
    )

    val dark = ThemePalette(
        bg = TokenColor(0xFF0B0C0EL),
        surface = TokenColor(0xFF17191CL),
        sheet = TokenColor(0xFF1A1C20L),
        ink = TokenColor(0xFFF2F4F6L),
        ink2 = TokenColor(0xFFD6DADEL),
        muted = TokenColor(0xFFA7AEB5L),
        faint = TokenColor(0xFF80878FL),
        line = TokenColor(0xFF25292DL),
        outline = TokenColor(0xFF454B52L),
        track = TokenColor(0xFF24272BL),
        chip = TokenColor(0xFF1D2023L),
        tonal = TokenColor(0xFF26375AL),
        tint = TokenColor(0xFF7AA7FFL),
        up = TokenColor(0xFFFF6B6BL),
        down = TokenColor(0xFF34D17FL),
        fullInk = TokenColor(0xFFFFE1E1L),
        gS = TokenColor(0xFF19212BL),
        gSInk = TokenColor(0xFFA8BDD4L),
        gL = TokenColor(0xFF251F16L),
        gLInk = TokenColor(0xFFF0BF7AL),
        stall = TokenColor(0x52000000L),
        wk = TokenColor(0xFF221819L),
        band = TokenColor(0xFF121417L),
        warnBg = TokenColor(0xFF33250CL),
        warnInk = TokenColor(0xFFFFC76BL),
        warnLine = TokenColor(0xFF6B4B12L),
        scrim = TokenColor(0x8C000000L),
        thumb = TokenColor(0xFF5B6067L),
        bar = TokenColor(0xFF0B0C0EL),
        widgetBg = TokenColor(0xFF1B2130L),
    )

    fun palette(theme: ThemeMode): ThemePalette = if (theme == ThemeMode.DARK) dark else light

    /** 상단 줄 범례 그라데이션: 각 점유율의 tint를 차례로 */
    val legendStops: List<Double> = listOf(0.6, 0.7, 0.8, 0.86, 0.9, 0.925, 0.95, 0.975, 1.0)

    val shuttleRoutes: Map<String, ShuttleRouteColor> = mapOf(
        "01" to ShuttleRouteColor(TokenColor(0xFF2F6FEDL), TokenColor(0xFFE6EEFDL), TokenColor(0xFF1C3159L)),
        "02" to ShuttleRouteColor(TokenColor(0xFF12A150L), TokenColor(0xFFE3F4EAL), TokenColor(0xFF13402AL)),
        "03" to ShuttleRouteColor(TokenColor(0xFFE8870BL), TokenColor(0xFFFCF1E2L), TokenColor(0xFF543815L)),
        "04" to ShuttleRouteColor(TokenColor(0xFF7C4DFFL), TokenColor(0xFFEFEAFFL), TokenColor(0xFF33275EL)),
        "05" to ShuttleRouteColor(TokenColor(0xFF5F6670L), TokenColor(0xFFECEDEEL), TokenColor(0xFF2B2E33L)),
    )

    object Spacing {
        const val S4 = 4f
        const val S6 = 6f
        const val S8 = 8f
        const val S10 = 10f
        const val S12 = 12f
        const val S16 = 16f
        const val S20 = 20f
    }

    object Radius {
        const val SLAB = 5f
        const val R6 = 6f
        const val R8 = 8f
        const val R10 = 10f
        const val R12 = 12f
        const val R14 = 14f
        const val R16 = 16f
        const val R20 = 20f
        const val PILL = 999f
    }

    val segmentThumbShadow = Shadow(0f, 1f, 4f, TokenColor(0x29000000L))
    val sheetShadow = Shadow(0f, -8f, 30f, TokenColor(0x2E000000L))
}
