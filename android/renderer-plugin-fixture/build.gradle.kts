plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "app.com.tmlpocket.rendererfixture"
    compileSdk = 37

    defaultConfig {
        applicationId = "app.com.tmlpocket.rendererfixture"
        minSdk = 28
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"
    }

    sourceSets["main"].assets.srcDir(rootProject.file("../build/renderer-plugin-fixture-assets"))
}

tasks.named("preBuild") {
    doLast {
        val assets = rootProject.file("../build/renderer-plugin-fixture-assets/tml-renderer/manifest.json")
        require(assets.isFile) {
            "Renderer fixture assets are missing. Run scripts/build/prepare-renderer-fixture.ps1 first."
        }
    }
}
