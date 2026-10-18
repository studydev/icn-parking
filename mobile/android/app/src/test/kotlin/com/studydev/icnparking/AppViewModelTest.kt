package com.studydev.icnparking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppViewModelTest {
    @Test
    fun analyticsWithoutFirebaseConfigurationDoesNotBlockNavigation() {
        val model = AppViewModel(client = null, settingsStore = null, shuttle = null)
        model.setTerminal(com.studydev.icnparking.core.generated.Terminal.T2)
        model.open(com.studydev.icnparking.core.presentation.DeepLink.Forecast(com.studydev.icnparking.core.generated.Terminal.T1))
        AppAnalytics.screen("forecast")
        assertEquals(AppTab.FORECAST, model.state.value.tab)
        assertEquals(com.studydev.icnparking.core.generated.Terminal.T1, model.state.value.terminal)
    }

    @Test
    fun withoutDataUrlModelIsNotConfigured() {
        val model = AppViewModel(client = null, settingsStore = null, shuttle = null)
        model.refresh()
        assertEquals(AppViewModel.Phase.NOT_CONFIGURED, model.state.value.phase)
        assertNull(model.state.value.freshness)
    }
}
