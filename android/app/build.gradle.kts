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

tasks.named("preBuild") {
    dependsOn(prepareLauncherAssets)
    dependsOn(prepareLauncherUi)
}

android {
    namespace = "dev.tml.mobilelauncher"
    compileSdk = 37
    ndkVersion = "30.0.14904198 rc1"

    defaultConfig {
        applicationId = "com.example.fnatemplate"
        minSdk = 28
        targetSdk = 37
        versionCode = 1040422
        versionName = "0.1.12"

        externalNativeBuild {
            cmake {
                arguments += listOf(
                    "-DCMAKE_C_STANDARD=11",
                    "-DCMAKE_CXX_STANDARD=20"
                )
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
            isEnable = true
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
