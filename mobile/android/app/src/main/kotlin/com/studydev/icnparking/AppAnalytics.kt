package com.studydev.icnparking

import android.content.Context
import android.os.Bundle
import com.google.firebase.FirebaseApp
import com.google.firebase.analytics.FirebaseAnalytics

/** Only initialized with the mobile Firebase config. No URLs or personal information. */
object AppAnalytics {
    private var analytics: FirebaseAnalytics? = null

    fun configure(context: Context) {
        if (FirebaseApp.initializeApp(context) == null) return
        analytics = FirebaseAnalytics.getInstance(context)
    }

    fun event(name: String, parameters: Map<String, String> = emptyMap()) {
        analytics?.logEvent(name, Bundle().apply {
            parameters.forEach { (key, value) -> putString(key, value) }
        })
    }

    fun screen(name: String) = event("screen_view", mapOf("screen_name" to name, "screen_class" to "RootScreen"))
}
