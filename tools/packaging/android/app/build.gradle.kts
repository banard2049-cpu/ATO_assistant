plugins {
  id("com.android.application")
}

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

  buildTypes {
    release {
      isMinifyEnabled = false
      signingConfig = signingConfigs.getByName("debug")
    }
  }
}
