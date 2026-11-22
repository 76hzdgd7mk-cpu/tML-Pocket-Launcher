plugins {
    alias(libs.plugins.android.application)
}

val verifyExternalSources by tasks.registering(Exec::class) {
    workingDir(rootDir)
    commandLine(
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "../scripts/checks/check-native-sources.ps1"
    )
}

val prepareLauncherAssets by tasks.registering(Exec::class) {
    dependsOn(verifyExternalSources)
    workingDir(rootDir)
    commandLine(
        "powershell",
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        "../scripts/build/prepare-launcher.ps1"
    )
}

val prepareLauncherUi by tasks.registering(Exec::class) {
    workingDir(rootDir)
    commandLine("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "../scripts/build/prepare-launcher-ui.ps1")
    inputs.dir("../../ui/launcher/src")
    inputs.dir("../../ui/launcher/public")
    inputs.files("../../ui/launcher/package.json", "../../ui/launcher/package-lock.json", "../../ui/launcher/vite.config.ts", "../../ui/launcher/index.html")
    outputs.dir("src/main/assets/ui")
}

val defaultTmlAssets = layout.buildDirectory.dir("generated/defaultTmlAssets")
val defaultTmlArchive = providers.gradleProperty("defaultTmlArchive").map { file(it) }
val prepareDefaultTml by tasks.registering(Exec::class) {
    val bundle = defaultTmlAssets.map { it.file("tmodloader-default/tModLoader.zip") }
    workingDir(rootDir)
    commandLine(
        "powershell", "-NoProfile", "-ExecutionPolicy", "Bypass",
        "-File", "../scripts/build/prepare-default-tml.ps1",
        "-OutputPath", bundle.get().asFile.absolutePath,
    )
    defaultTmlArchive.orNull?.let {
        args("-ArchivePath", it.absolutePath)
        inputs.file(it)
    }
    inputs.file("../../scripts/build/prepare-default-tml.ps1")
    outputs.file(bundle)
}

val textureFallback = providers.gradleProperty("mobileTerrariaTextureFallback")
val mobileTerrariaProfile = providers.gradleProperty("mobileTerrariaProfile")
val mobileTerrariaEnabled = mobileTerrariaProfile.isPresent
val mobileTerrariaAssets = layout.buildDirectory.dir("generated/mobileTerrariaAssets").get().asFile

val prepareMobileTerrariaProfile by tasks.registering(Sync::class) {
    from("../../managed/MobileLauncher.Controls/Assets/APK-SPRITES.json") {
        into("mobile-terraria")
        rename { "control-sprites.json" }
    }
    from(mobileTerrariaProfile.map { path ->
        val archive = file(path)
        require(archive.isFile) { "Mobile Terraria profile ZIP is missing: $archive" }
        archive
    }) {
        into("mobile-terraria")
        rename { "profile.zip" }
    }
    into(layout.buildDirectory.dir("generated/mobileTerrariaProfile"))
}
val prepareMobileTerrariaTextures by tasks.registering(Sync::class) {
    from(textureFallback.map { path ->
        val archive = file(path)
        require(archive.isFile) { "Mobile Terraria texture fallback ZIP is missing: $archive" }
        archive
    }) {
        into("mobile-terraria")
        rename { "texture-fallback.zip" }
    }
    into(mobileTerrariaAssets)
}

tasks.configureEach {
    if (name == "mergeDebugAssets" && textureFallback.isPresent) {
        dependsOn(prepareMobileTerrariaTextures)
    }
    if (name in setOf("mergeDebugAssets", "mergeReleaseAssets") && mobileTerrariaEnabled) {
        dependsOn(prepareMobileTerrariaProfile)
    }
}

tasks.named("preBuild") {
    dependsOn(prepareLauncherAssets)
    dependsOn(prepareLauncherUi)
    dependsOn(prepareDefaultTml)
}

android {
    namespace = "app.com.tmlpocket"
    compileSdk = 37
    ndkVersion = "30.0.14904198 rc1"
    sourceSets.named("main") {
        assets.directories.add(defaultTmlAssets.get().asFile.absolutePath)
    }

    if (textureFallback.isPresent) {
        sourceSets.named("debug") {
            assets.directories.add(mobileTerrariaAssets.absolutePath)
        }
    }
    if (mobileTerrariaEnabled) {
        sourceSets.named("main") {
            assets.directories.add(layout.buildDirectory.dir("generated/mobileTerrariaProfile").get().asFile.absolutePath)
            kotlin.directories.add(file("src/mobileTerraria/java").absolutePath)
        }
        sourceSets.named("androidTest") {
            kotlin.directories.add(file("src/mobileTerrariaTest/java").absolutePath)
        }
    } else {
        sourceSets.named("main") {
            kotlin.directories.add(file("src/noMobileTerraria/java").absolutePath)
        }
    }


    defaultConfig {
        applicationId = "app.com.tmlpocket"
        minSdk = 28
        targetSdk = 37
        versionCode = 1040422
        versionName = "0.1.12"
        if (mobileTerrariaEnabled) {
            testInstrumentationRunner = "app.com.tmlpocket.feature.installation.MobileTerrariaConversionTest"
            ndk.abiFilters.add("arm64-v8a")
        }

        externalNativeBuild {
            cmake {
                arguments += listOf(
                    "-DCMAKE_C_STANDARD=11",
                    "-DCMAKE_CXX_STANDARD=20"
                )
                arguments += "-DTML_MOBILE_TERRARIA_CONVERTER=${if (mobileTerrariaEnabled) "ON" else "OFF"}"
                if (mobileTerrariaEnabled) {
                    for (dependency in listOf("MOBILE_VGMSTREAM", "MOBILE_OGG", "MOBILE_VORBIS", "MOBILE_LZ4")) {
                        val key = "FETCHCONTENT_SOURCE_DIR_$dependency"
                        providers.gradleProperty(key).orNull?.let { arguments += "-D$key=${file(it).absolutePath}" }
                    }
                }
            }
        }
    }

    externalNativeBuild {
        cmake {
            path = file("../native/CMakeLists.txt")
            version = "3.22.1"
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_21
        targetCompatibility = JavaVersion.VERSION_21
    }

    kotlin {
        jvmToolchain(21)
    }

    splits {
        abi {
            isEnable = !mobileTerrariaEnabled
            reset()
            include("arm64-v8a")
            isUniversalApk = false
        }
    }

    buildTypes {
        debug {
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
        }
        release {
            isMinifyEnabled = false
            isShrinkResources = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        jniLibs {
            useLegacyPackaging = true
            pickFirsts += "lib/arm64-v8a/libc++_shared.so"
        }
    }
}

dependencies {
    implementation("androidx.fragment:fragment:1.8.5")
    implementation(libs.webkit)
    implementation(libs.commons.compress)
    implementation(libs.xz)
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.json:json:20240303")
}
