package expo.modules.developeroptions

import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeveloperOptionsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DeveloperOptions")

    Function("isDeveloperOptionsEnabled") {
      val context = appContext.reactContext ?: return@Function false
      Settings.Global.getInt(
        context.contentResolver,
        Settings.Global.DEVELOPMENT_SETTINGS_ENABLED,
        0
      ) == 1
    }
  }
}
