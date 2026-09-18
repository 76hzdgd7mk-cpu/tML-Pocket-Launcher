plugins {
    alias(libs.plugins.android.application)
}

val prepareGameAssets by tasks.registering(Exec::class) {
    workingDir(rootDir)
    commandLine("powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "scripts/prepare-game.ps1")
}

tasks.named("preBuild") {
    dependsOn(prepareGameAssets)
}

android {
    namespace = "com.example.fnatemplate"
    compileSdk = 37
    ndkVersion = "30.0.14904198 rc1"

    defaultConfig {
        applicationId = "com.example.fnatemplate"
        minSdk = 28
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
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
    implementation(libs.core.ktx)
    implementation(libs.activity)
    implementation(libs.fragment)
    implementation(libs.commons.compress)
    implementation(libs.xz)
}
