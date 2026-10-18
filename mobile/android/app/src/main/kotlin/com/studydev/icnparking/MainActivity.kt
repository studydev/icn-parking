package com.studydev.icnparking

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import com.studydev.icnparking.core.presentation.DeepLink
import com.studydev.icnparking.widget.WidgetPins

class MainActivity : ComponentActivity() {
    private val model: AppViewModel by viewModels { viewModelFactory { initializer { AppViewModel.create(applicationContext) } } }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) handle(intent)
        setContent {
            ParkingTheme { RootScreen(model) }
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handle(intent)
    }

    /** icnparking:// 딥링크(위젯 탭·외부 링크) */
    private fun handle(intent: Intent) {
        DeepLink.parse(intent.dataString)?.let(model::open)
        if (!BuildConfig.DEBUG) return
        // 개발용: 에뮬레이터 스크린샷에서 탭·시트를 바로 열고(--es tab forecast --es sheet t1-short-b2) 위젯 놓기를 요청(--es pinWidget small|medium)
        intent.getStringExtra("tab")?.let { name -> AppTab.entries.firstOrNull { it.name.equals(name, ignoreCase = true) }?.let(model::setTab) }
        intent.getStringExtra("sheet")?.let { DeepLink.parse("icnparking://zone/$it")?.let(model::open) }
        intent.getStringExtra("pinWidget")?.let { WidgetPins.request(this, medium = it == "medium") }
    }
}
