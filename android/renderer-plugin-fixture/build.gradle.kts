plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "dev.tml.mobilelauncher.rendererfixture"
    compileSdk = 37

    defaultConfig {
        applicationId = "dev.tml.mobilelauncher.rendererfixture"
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
