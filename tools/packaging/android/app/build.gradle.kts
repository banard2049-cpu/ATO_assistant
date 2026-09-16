plugins {
  id("com.android.application")
}

val releaseKeystorePath = providers.environmentVariable("ATO_ANDROID_KEYSTORE_PATH").orNull
val releaseStorePassword = providers.environmentVariable("ATO_ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias = providers.environmentVariable("ATO_ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword = providers.environmentVariable("ATO_ANDROID_KEY_PASSWORD").orNull
val hasReleaseSigning = listOf(
  releaseKeystorePath, releaseStorePassword, releaseKeyAlias, releaseKeyPassword
).all { !it.isNullOrBlank() }
// Publishing paths (release_android.ps1 -Publish and android-release.yml) set this variable:
// without a persistent release signing config the build must fail instead of falling back to
// the Debug keystore, whose APK can never be replaced by a properly signed one.
val requireReleaseSigning = providers.environmentVariable("ATO_ANDROID_REQUIRE_SIGNING").orNull == "1"
if (requireReleaseSigning && !hasReleaseSigning) {
  throw GradleException(
    "ATO_ANDROID_REQUIRE_SIGNING=1 but the release signing config is missing. Set " +
      "ATO_ANDROID_KEYSTORE_PATH, ATO_ANDROID_KEYSTORE_PASSWORD, ATO_ANDROID_KEY_ALIAS and " +
      "ATO_ANDROID_KEY_PASSWORD before publishing."
  )
}

// 发布路径必须显式给出 versionCode：兜底成 1 会造出比线上更小的版本号，Android 会
// 直接拒绝安装，而这种失败在 CI 日志里很难看出原因（export_android.py 的
// -PatoVersionCode / -PatoVersionName 是唯一来源）。
val atoVersionCode = providers.gradleProperty("atoVersionCode").orNull?.toIntOrNull()
if (requireReleaseSigning && atoVersionCode == null) {
  throw GradleException(
    "发布构建缺少 -PatoVersionCode（应来自 tools/export_android.py）。拒绝回退到 versionCode=1。"
  )
}

android {
  namespace = "com.ato.assistant"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.ato.assistant"
    minSdk = 24
    targetSdk = 35
    versionCode = atoVersionCode ?: 1
    versionName = providers.gradleProperty("atoVersionName").orNull ?: "dev"
  }

  signingConfigs {
    if (hasReleaseSigning) {
      create("release") {
        storeFile = file(releaseKeystorePath!!)
        storePassword = releaseStorePassword
        keyAlias = releaseKeyAlias
        keyPassword = releaseKeyPassword
      }
    }
  }

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = if (hasReleaseSigning) {
        signingConfigs.getByName("release")
      } else {
        logger.warn("Android release signing is not configured; using the Debug keystore. This APK must not be published.")
        signingConfigs.getByName("debug")
      }
    }
  }
}

dependencies {
  implementation("org.apache.commons:commons-compress:1.21")
}
