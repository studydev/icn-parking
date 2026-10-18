package com.studydev.icnparking.core

import android.content.Context
import com.studydev.icnparking.core.data.DataClient
import com.studydev.icnparking.core.data.FileStore
import com.studydev.icnparking.core.settings.SettingsStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import java.io.File

/** "/"로 끝나는 https data 디렉터리 URL로 정리. 설정이 없거나 https가 아니면 null (iOS AppConfig와 같은 규칙) */
fun normalizeDataBaseUrl(raw: String?): String? {
    val value = raw?.trim().orEmpty()
    if (value.isEmpty() || value.contains("$(")) return null
    val url = if (value.endsWith("/")) value else "$value/"
    val host = url.removePrefix("https://").substringBefore("/")
    return if (url.startsWith("https://") && host.isNotEmpty()) url else null
}

/**
 * 프로세스에 하나만 있는 데이터·설정 객체. 앱과 위젯(같은 프로세스)이 함께 쓴다.
 * DataStore는 파일 하나에 인스턴스 하나만 허용하므로 Activity·ViewModel마다 만들면 안 된다.
 */
object ParkingServices {
    class Services(
        /** 데이터 주소가 빌드에 없으면 null(local.properties icn.dataBaseUrl) */
        val client: DataClient?,
        val settings: SettingsStore,
    )

    @Volatile private var services: Services? = null

    /** Application.onCreate에서 한 번 부른다 */
    fun install(context: Context, dataBaseUrl: String?): Services = services ?: synchronized(this) {
        services ?: run {
            val app = context.applicationContext
            val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
            Services(
                client = normalizeDataBaseUrl(dataBaseUrl)?.let { DataClient(it, FileStore(File(app.filesDir, "parking-data"))) },
                settings = SettingsStore.create(File(app.filesDir, "datastore/settings.preferences_pb"), scope),
            ).also { services = it }
        }
    }

    fun get(): Services = services ?: error("ParkingServices.install이 먼저 불려야 해요")
}
