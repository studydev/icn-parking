import java.util.Properties
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
}

// 데이터 주소는 저장소에 넣지 않는다: CI = 환경 변수 ICN_DATA_BASE_URL, 로컬 = local.properties(git 제외) icn.dataBaseUrl
val localProperties = Properties().apply { rootProject.file("local.properties").takeIf { it.isFile }?.inputStream()?.use(::load) }
val dataBaseUrl: String = providers.environmentVariable("ICN_DATA_BASE_URL").orNull ?: localProperties.getProperty("icn.dataBaseUrl").orEmpty()

android {
    namespace = "com.studydev.icnparking"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.studydev.icnparking"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        versionName = "1.0.0"
        buildConfigField("String", "DATA_BASE_URL", "\"${dataBaseUrl.replace("\\", "\\\\").replace("\"", "\\\"")}\"")
    }

    // 업로드 키는 저장소 밖에 둔다: 환경 변수(CI) 또는 local.properties(git 제외)
    fun secret(env: String, prop: String): String? = providers.environmentVariable(env).orNull ?: localProperties.getProperty(prop)
    val uploadKeystore = secret("ICN_UPLOAD_KEYSTORE", "icn.uploadKeystore")
    signingConfigs {
        if (uploadKeystore != null) {
            create("upload") {
                storeFile = file(uploadKeystore)
                storePassword = secret("ICN_UPLOAD_KEYSTORE_PASSWORD", "icn.uploadKeystorePassword")
                keyAlias = secret("ICN_UPLOAD_KEY_ALIAS", "icn.uploadKeyAlias")
                keyPassword = secret("ICN_UPLOAD_KEY_PASSWORD", "icn.uploadKeyPassword")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            // 업로드 키가 없으면 로컬 확인용으로 디버그 키 서명(스토어에 올리면 안 됨)
            signingConfig = signingConfigs.findByName("upload") ?: signingConfigs.getByName("debug")
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(JvmTarget.JVM_17)
    }
}

/** 셔틀 시간표는 mobile/shared/shuttle.json 하나만 원본으로 두고 빌드 때 assets에 넣는다 */
abstract class CopySharedAssets : DefaultTask() {
    @get:InputFile abstract val shuttle: RegularFileProperty
    @get:OutputDirectory abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val out = outputDir.get().asFile.apply { mkdirs() }
        shuttle.get().asFile.copyTo(out.resolve("shuttle.json"), overwrite = true)
    }
}

val copySharedAssets = tasks.register<CopySharedAssets>("copySharedAssets") {
    shuttle.set(rootProject.layout.projectDirectory.file("../shared/shuttle.json"))
}

androidComponents {
    onVariants { variant -> variant.sources.assets?.addGeneratedSourceDirectory(copySharedAssets, CopySharedAssets::outputDir) }
}

dependencies {
    implementation(project(":core"))
    implementation(project(":widget"))
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.kotlinx.coroutines.android)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    debugImplementation(libs.compose.ui.tooling)
    testImplementation(libs.junit)
}
