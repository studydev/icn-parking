package com.studydev.icnparking

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class AppViewModelTest {
    @Test
    fun withoutDataUrlModelIsNotConfigured() {
        val model = AppViewModel(client = null, settingsStore = null, shuttle = null)
        model.refresh()
        assertEquals(AppViewModel.Phase.NOT_CONFIGURED, model.state.value.phase)
        assertNull(model.state.value.freshness)
    }
}
