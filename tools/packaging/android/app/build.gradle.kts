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

android {
  namespace = "com.ato.assistant"
  compileSdk = 35

  defaultConfig {
    applicationId = "com.ato.assistant"
    minSdk = 24
    targetSdk = 35
    versionCode = providers.gradleProperty("atoVersionCode").orNull?.toIntOrNull() ?: 1
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
      signingConfig = signingConfigs.getByName(if (hasReleaseSigning) "release" else "debug")
    }
  }
}

dependencies {
  implementation("org.apache.commons:commons-compress:1.21")
}
