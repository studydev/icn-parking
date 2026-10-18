package com.studydev.icnparking

import android.app.Application
import com.studydev.icnparking.core.ParkingServices
import com.studydev.icnparking.widget.WidgetRefresh

class ParkingApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        AppAnalytics.configure(this)
        ParkingServices.install(this, BuildConfig.DATA_BASE_URL)
        WidgetRefresh.scheduleIfNeeded(this)
    }
}
