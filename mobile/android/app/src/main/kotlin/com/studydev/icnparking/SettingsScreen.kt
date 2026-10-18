package com.studydev.icnparking

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.studydev.icnparking.core.generated.Strings
import com.studydev.icnparking.core.generated.Terminal

/** 설정: 기본 터미널 · 표시 · 웹에서 자세히 보기 · 안내 · "로그인·위치 정보를 사용하지 않아요 · 버전". Android 카드(r20, 1px line), 소제목 tint 14/600. 즐겨찾기 없음 */
@Composable
fun SettingsScreen(state: AppViewModel.UiState, model: AppViewModel) {
    val theme = LocalTheme.current
    val uri = LocalUriHandler.current
    Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(bottom = 12.dp)) {
        Caption(Strings.Settings.defaultTerminal)
        Segmented(
            listOf(Terminal.T1 to Strings.Header.terminal1Long, Terminal.T2 to Strings.Header.terminal2Long), state.settings.defaultTerminal, model::setDefaultTerminal,
            wide = true, modifier = Modifier.padding(horizontal = 16.dp),
        )
        Caption(Strings.Settings.display)
        Card {
            Row(Modifier.fillMaxWidth().clickable { model.setShowDelta(!state.settings.showDelta) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(Strings.Settings.showDelta, style = styleS(15f, color = theme.p.ink.toColor()), modifier = Modifier.weight(1f))
                Switch(
                    checked = state.settings.showDelta, onCheckedChange = model::setShowDelta,
                    colors = SwitchDefaults.colors(checkedTrackColor = theme.p.tint.toColor(), checkedThumbColor = theme.p.bg.toColor()),
                )
            }
        }
        Caption(Strings.Settings.web)
        Card {
            val t = state.terminal.code
            LinkRow(Strings.Settings.webHome, Strings.Settings.webHomeBody, divider = false) { uri.openUri(Strings.Settings.webBaseUrl) }
            LinkRow(Strings.Settings.webStatus, Strings.Settings.webStatusBody) { uri.openUri(Strings.Settings.webBaseUrl + "#week/$t") }
            LinkRow(Strings.Settings.webHistory, Strings.Settings.webHistoryBody) { uri.openUri(Strings.Settings.webBaseUrl + "#day/$t") }
            LinkRow(Strings.Settings.webShuttle, Strings.Settings.webShuttleBody) { uri.openUri(Strings.Settings.webBaseUrl + "#access/$t") }
            LinkRow(Strings.Settings.webFees, Strings.Settings.webFeesBody) { uri.openUri(Strings.Settings.webBaseUrl + "fees.html?terminal=$t") }
        }
        Caption(Strings.Settings.info)
        Card {
            InfoRow(Strings.Settings.dataSource, Strings.Settings.dataSourceBody, divider = false)
            InfoRow(Strings.Settings.affiliation, Strings.Settings.affiliationBody)
            InfoRow(Strings.Settings.forecastLimit, Strings.Settings.forecastLimitBody)
            LinkRow(Strings.Settings.openSource, Strings.Settings.openSourceLabel) { uri.openUri(Strings.Settings.openSourceUrl) }
        }
        Text(Strings.Settings.privacy(versionText()), style = styleS(12f, color = theme.p.faint.toColor()), modifier = Modifier.padding(start = 20.dp, end = 20.dp, top = 14.dp, bottom = 8.dp))
    }
}

private fun versionText(): String = "${BuildConfig.VERSION_NAME} (${BuildConfig.VERSION_CODE})"

@Composable
private fun Caption(text: String) {
    val theme = LocalTheme.current
    Text(text, style = styleS(14f, FontWeight.SemiBold, theme.p.tint.toColor()), modifier = Modifier.padding(start = 28.dp, end = 28.dp, top = 20.dp, bottom = 9.dp))
}

@Composable
private fun Card(content: @Composable ColumnScope.() -> Unit) {
    val theme = LocalTheme.current
    val shape = RoundedCornerShape(20.dp)
    Column(Modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(shape).background(theme.p.surface.toColor()).border(1.dp, theme.p.line.toColor(), shape), content = content)
}

@Composable
private fun InfoRow(title: String, body: String, divider: Boolean = true) {
    val theme = LocalTheme.current
    if (divider) Box(Modifier.fillMaxWidth().height(1.dp).background(theme.p.line.toColor()))
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 13.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = styleS(15f, color = theme.p.ink.toColor()))
        Text(body, style = styleS(13f, color = theme.p.muted.toColor()).copy(lineHeight = fs(19.5f)))
    }
}

/** 바깥 링크 행(웹 페이지 바로 가기 · 오픈소스) */
@Composable
private fun LinkRow(title: String, body: String, divider: Boolean = true, onClick: () -> Unit) {
    val theme = LocalTheme.current
    if (divider) Box(Modifier.fillMaxWidth().height(1.dp).background(theme.p.line.toColor()))
    Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 13.dp), verticalAlignment = Alignment.CenterVertically) {
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = styleS(15f, color = theme.p.ink.toColor()))
            Text(body, style = styleS(13f, color = theme.p.muted.toColor()))
        }
        Text("↗", style = styleS(15f, color = theme.p.faint.toColor()))
    }
}
