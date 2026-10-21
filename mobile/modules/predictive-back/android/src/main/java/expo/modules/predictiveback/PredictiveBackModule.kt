package expo.modules.predictiveback

import androidx.activity.BackEventCompat
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Android's predictive back, as events for JavaScript. React Native's BackHandler only hears the finished gesture; this
 * reports it while it happens (started, progress 0..1, cancelled, committed), so the app can slide its page with the
 * finger the way system apps do. JavaScript enables it only while a page that can be swiped away is open; otherwise the
 * gesture falls through to React Native's own handler (and, from the first screen, to the system's back-to-home).
 */
class PredictiveBackModule : Module() {
  private var callback: OnBackPressedCallback? = null

  override fun definition() = ModuleDefinition {
    Name("PredictiveBack")

    Events("onBackStart", "onBackProgress", "onBackCancel", "onBack")

    Function("setEnabled") { enabled: Boolean ->
      val activity = appContext.currentActivity as? ComponentActivity
      activity?.runOnUiThread {
        val cb = callback ?: object : OnBackPressedCallback(false) {
          override fun handleOnBackStarted(backEvent: BackEventCompat) {
            sendEvent("onBackStart", mapOf("left" to (backEvent.swipeEdge == BackEventCompat.EDGE_LEFT)))
          }

          override fun handleOnBackProgressed(backEvent: BackEventCompat) {
            sendEvent("onBackProgress", mapOf("progress" to backEvent.progress.toDouble()))
          }

          override fun handleOnBackCancelled() {
            sendEvent("onBackCancel", emptyMap<String, Any>())
          }

          override fun handleOnBackPressed() {
            sendEvent("onBack", emptyMap<String, Any>())
          }
        }.also {
          callback = it
          activity.onBackPressedDispatcher.addCallback(activity, it)
        }
        cb.isEnabled = enabled
      }
    }

    OnDestroy {
      callback?.remove()
      callback = null
    }
  }
}
