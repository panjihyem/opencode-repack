import { Notification, app } from "electron"
import { AppImageUpdater, NsisUpdater } from "electron-updater"

/** Linux AppImage OTA only. Windows waits for Authenticode signing; macOS waits for notarization. */
export function startHyperUpdates(log: (message: string) => void) {
  if (!app.isPackaged || app.getVersion().includes("-")) return
  if (process.platform === "linux" && !process.env.APPIMAGE) return
  // Don't start Windows updates until the release pipeline supplies the expected
  // Authenticode publisher. electron-updater otherwise cannot verify the installer.
  if (process.platform === "win32" && !process.env.HYPER_UPDATE_PUBLISHER) return
  if (process.platform !== "linux" && process.platform !== "win32") return

  const updater = process.platform === "linux" ? new AppImageUpdater() : new NsisUpdater()
  if (process.platform === "linux" && process.arch === "arm64") updater.channel = "latest-arm64"
  updater.autoDownload = true
  updater.autoInstallOnAppQuit = true
  if (process.platform === "win32") updater.autoInstallOnAppQuit = false // installer needs explicit user action
  updater.on("update-available", (info) => log(`OTA tersedia: ${info.version}; sedang diunduh`))
  updater.on("update-downloaded", (info) => {
    log(`OTA siap: ${info.version}; tutup Hyper AI untuk memasang`)
    new Notification({ title: "Pembaruan Hyper AI siap", body: `Versi ${info.version} akan dipasang saat aplikasi ditutup.` }).show()
  })
  updater.on("error", (error) => log(`OTA gagal: ${error.message}`))
  void updater.checkForUpdates().catch((error) => log(`OTA gagal: ${error instanceof Error ? error.message : error}`))
}
