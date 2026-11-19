package dev.tml.mobilelauncher.feature.renderers

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RendererSelectionTest {
    @Test
    fun selectionMustBePresentInCompatibleCatalog() {
        assertTrue(RendererSelection.isAvailable("native", emptySet()))
        assertTrue(RendererSelection.isAvailable("dev.example.renderer:gl4es", setOf("dev.example.renderer:gl4es")))
        assertFalse(RendererSelection.isAvailable("dev.other.renderer:gl4es", setOf("dev.example.renderer:gl4es")))
        assertFalse(RendererSelection.isAvailable("../bad:gl4es", setOf("../bad:gl4es")))
        assertFalse(RendererSelection.isAvailable("", emptySet()))
    }
}
