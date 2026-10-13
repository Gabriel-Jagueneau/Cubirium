import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKScriptMessageHandler, WKUIDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var serverProcess: Process?

    func applicationDidFinishLaunching(_ notification: Notification) {
        // 1. Démarrer le serveur Node.js s'il n'est pas déjà actif
        ensureServerRunning()

        // 2. Créer le raccourci sur le Bureau s'il n'existe pas encore
        ensureDesktopShortcut()

        // 3. Créer la fenêtre native de l'application
        let screenSize = NSScreen.main?.visibleFrame.size ?? CGSize(width: 1440, height: 900)
        let initialWidth = min(1280.0, max(1080.0, screenSize.width * 0.88))
        let initialHeight = min(860.0, max(700.0, screenSize.height * 0.85))
        let rect = NSRect(x: 0, y: 0, width: initialWidth, height: initialHeight)

        window = NSWindow(
            contentRect: rect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.center()
        window.title = "Cubirium"
        window.minSize = NSSize(width: 980, height: 640)
        window.delegate = self
        window.isReleasedWhenClosed = false
        window.backgroundColor = NSColor(red: 13/255.0, green: 17/255.0, blue: 23/255.0, alpha: 1.0)

        // Configurer WKWebView avec bridge de messages natifs
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        config.userContentController.add(self, name: "openFinder")
        config.userContentController.add(self, name: "chooseFolder")
        config.userContentController.add(self, name: "chooseImportPath")
        config.userContentController.add(self, name: "chooseModsPath")
        config.userContentController.add(self, name: "openExternalUrl")
        config.userContentController.add(self, name: "terminateApp")
        config.userContentController.add(self, name: "uninstallApp")

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.uiDelegate = self
        webView.autoresizingMask = [.width, .height]
        webView.underPageBackgroundColor = NSColor(red: 13/255.0, green: 17/255.0, blue: 23/255.0, alpha: 1.0)
        window.contentView?.addSubview(webView)

        setupMenu()

        window.makeKeyAndOrderFront(nil)
        window.makeFirstResponder(webView)
        NSApp.activate(ignoringOtherApps: true)

        // Charger l'URL de l'application
        loadAppUrl()
    }

    func ensureDesktopShortcut() {
        guard let desktopURL = FileManager.default.urls(for: .desktopDirectory, in: .userDomainMask).first else { return }
        let duplicateURL = desktopURL.appendingPathComponent("Cubirium")
        let appNameURL = desktopURL.appendingPathComponent("Cubirium.app")
        
        // Supprimer inconditionnellement tout ancien doublon sans extension .app
        if FileManager.default.fileExists(atPath: duplicateURL.path) {
            try? FileManager.default.removeItem(at: duplicateURL)
        }
        let legacyShortcut = desktopURL.appendingPathComponent("Minecraft Server Manager")
        let legacyAppShortcut = desktopURL.appendingPathComponent("Minecraft Server Manager.app")
        if FileManager.default.fileExists(atPath: legacyShortcut.path) {
            try? FileManager.default.removeItem(at: legacyShortcut)
        }
        if FileManager.default.fileExists(atPath: legacyAppShortcut.path) {
            try? FileManager.default.removeItem(at: legacyAppShortcut)
        }

        // Si le raccourci .app existe déjà, ne rien faire
        if FileManager.default.fileExists(atPath: appNameURL.path) {
            return
        }

        let appURL = Bundle.main.bundleURL
        try? FileManager.default.createSymbolicLink(at: appNameURL, withDestinationURL: appURL)
    }

    func ensureServerRunning() {
        guard let url = URL(string: "http://localhost:4567/api/status") else { return }
        var request = URLRequest(url: url)
        request.timeoutInterval = 0.5
        let semaphore = DispatchSemaphore(value: 0)
        var isRunning = false

        let task = URLSession.shared.dataTask(with: request) { _, response, _ in
            if let http = response as? HTTPURLResponse, http.statusCode == 200 {
                isRunning = true
            }
            semaphore.signal()
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 0.6)

        if !isRunning {
            startNodeServer()
        }
    }

    func startNodeServer() {
        let bundleResources = Bundle.main.resourceURL
        let bundledNode = bundleResources?.appendingPathComponent("bin/node").path
        let bundledServer = bundleResources?.appendingPathComponent("manager/src/server.js").path
        let bundledManagerDir = bundleResources?.appendingPathComponent("manager").path

        let appBundlePath = Bundle.main.bundlePath
        let parentDir = (appBundlePath as NSString).deletingLastPathComponent
        let devServerScript = (parentDir as NSString).appendingPathComponent("manager/src/server.js")
        let devManagerDir = (parentDir as NSString).appendingPathComponent("manager")

        var nodePath = "/usr/local/bin/node"
        var serverScript = devServerScript
        var workingDir = devManagerDir

        if let bNode = bundledNode, FileManager.default.isExecutableFile(atPath: bNode),
           let bScript = bundledServer, FileManager.default.fileExists(atPath: bScript) {
            nodePath = bNode
            serverScript = bScript
            if let bDir = bundledManagerDir {
                workingDir = bDir
            }
        } else {
            var possibleNodes = [
                "/opt/homebrew/bin/node",
                "/usr/local/bin/node"
            ]
            let homeDir = FileManager.default.homeDirectoryForCurrentUser.path
            let nvmDir = (homeDir as NSString).appendingPathComponent(".nvm/versions/node")
            if let versions = try? FileManager.default.contentsOfDirectory(atPath: nvmDir) {
                for v in versions.sorted().reversed() {
                    let cand = "\(nvmDir)/\(v)/bin/node"
                    if FileManager.default.isExecutableFile(atPath: cand) {
                        possibleNodes.append(cand)
                    }
                }
            }
            for p in possibleNodes {
                if FileManager.default.isExecutableFile(atPath: p) {
                    nodePath = p
                    break
                }
            }
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: nodePath)
        process.arguments = [serverScript]
        process.currentDirectoryURL = URL(fileURLWithPath: workingDir)

        var env = ProcessInfo.processInfo.environment
        env["APP_BUNDLE_PATH"] = Bundle.main.bundlePath
        if let bundleResources = bundleResources {
            let binPath = bundleResources.appendingPathComponent("bin").path
            env["PATH"] = "\(binPath):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + (env["PATH"] ?? "")
        } else {
            env["PATH"] = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:" + (env["PATH"] ?? "")
        }
        process.environment = env

        try? process.run()
        self.serverProcess = process

        Thread.sleep(forTimeInterval: 0.5)
    }

    func loadAppUrl() {
        if let targetUrl = URL(string: "http://localhost:4567") {
            webView.load(URLRequest(url: targetUrl))
        }
    }

    func setupMenu() {
        let mainMenu = NSMenu()

        // 1. Menu Application unique regroupant toutes les options
        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)

        let appMenu = NSMenu()
        let appName = "Cubirium"
        appMenu.addItem(withTitle: "À propos de \(appName)", action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        
        let settingsItem = NSMenuItem(title: "Paramètres...", action: #selector(openSettings), keyEquivalent: ",")
        appMenu.addItem(settingsItem)
        
        appMenu.addItem(withTitle: "Recharger l'interface", action: #selector(reloadApp), keyEquivalent: "r")
        appMenu.addItem(NSMenuItem.separator())

        // Commandes Fenêtre intégrées directement dans le menu principal
        appMenu.addItem(withTitle: "Réduire", action: #selector(NSWindow.performMiniaturize(_:)), keyEquivalent: "m")
        appMenu.addItem(withTitle: "Zoom", action: #selector(NSWindow.performZoom(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())

        appMenu.addItem(withTitle: "Quitter \(appName)", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu

        // 2. Menu Édition standard macOS (indispensable pour Cmd+C, Cmd+V, Cmd+X, Cmd+A et clic droit)
        let editMenuItem = NSMenuItem(title: "Édition", action: nil, keyEquivalent: "")
        let editMenu = NSMenu(title: "Édition")
        
        let undoItem = NSMenuItem(title: "Annuler", action: Selector(("undo:")), keyEquivalent: "z")
        let redoItem = NSMenuItem(title: "Rétablir", action: Selector(("redo:")), keyEquivalent: "Z")
        let cutItem = NSMenuItem(title: "Couper", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        let copyItem = NSMenuItem(title: "Copier", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        let pasteItem = NSMenuItem(title: "Coller", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        let selectAllItem = NSMenuItem(title: "Tout sélectionner", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        undoItem.target = nil
        redoItem.target = nil
        cutItem.target = nil
        copyItem.target = nil
        pasteItem.target = nil
        selectAllItem.target = nil

        editMenu.addItem(undoItem)
        editMenu.addItem(redoItem)
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(cutItem)
        editMenu.addItem(copyItem)
        editMenu.addItem(pasteItem)
        editMenu.addItem(selectAllItem)

        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        NSApp.mainMenu = mainMenu
    }

    @objc func reloadApp() {
        webView.reload()
    }

    @objc func openSettings() {
        webView.evaluateJavaScript("window.openGlobalSettings && window.openGlobalSettings();", completionHandler: nil)
    }

    // Gestionnaire de messages natifs depuis la page Web
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        if message.name == "openFinder", let path = message.body as? String {
            let url = URL(fileURLWithPath: path)
            // Révèle uniquement l'archive dans le Finder sans la décompresser ni l'ouvrir
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } else if message.name == "chooseFolder" {
            DispatchQueue.main.async {
                let panel = NSOpenPanel()
                panel.canChooseFiles = false
                panel.canChooseDirectories = true
                panel.allowsMultipleSelection = false
                panel.canCreateDirectories = true
                panel.prompt = "Sélectionner"
                panel.message = "Sélectionnez le dossier de téléchargement"
                if panel.runModal() == .OK, let url = panel.url {
                    let escapedPath = url.path.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
                    let js = "window.onFolderChosen && window.onFolderChosen('\(escapedPath)');"
                    self.webView.evaluateJavaScript(js, completionHandler: nil)
                }
            }
        } else if message.name == "chooseImportPath" {
            DispatchQueue.main.async {
                let panel = NSOpenPanel()
                panel.canChooseFiles = true
                panel.canChooseDirectories = true
                panel.allowsMultipleSelection = false
                panel.canCreateDirectories = false
                panel.prompt = "Sélectionner"
                panel.message = "Sélectionnez un dossier de monde ou une archive .zip"
                if panel.runModal() == .OK, let url = panel.url {
                    let escapedPath = url.path.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "'", with: "\\'")
                    let js = "window.onImportPathChosen && window.onImportPathChosen('\(escapedPath)');"
                    self.webView.evaluateJavaScript(js, completionHandler: nil)
                }
            }
        } else if message.name == "chooseModsPath" {
            DispatchQueue.main.async {
                let panel = NSOpenPanel()
                panel.canChooseFiles = true
                panel.canChooseDirectories = true
                panel.allowsMultipleSelection = true
                panel.canCreateDirectories = false
                panel.prompt = "Sélectionner"
                panel.message = "Sélectionnez un dossier 'mods', des fichiers .jar ou une archive .zip / .mrpack"
                if panel.runModal() == .OK {
                    let paths = panel.urls.map { $0.path }
                    if let jsonData = try? JSONSerialization.data(withJSONObject: paths),
                       let jsonString = String(data: jsonData, encoding: .utf8) {
                        let js = "window.onModsPathsChosen && window.onModsPathsChosen(\(jsonString));"
                        self.webView.evaluateJavaScript(js, completionHandler: nil)
                    }
                }
            }
        } else if message.name == "openExternalUrl", let urlString = message.body as? String {
            if let url = URL(string: urlString) {
                NSWorkspace.shared.open(url)
            }
        } else if message.name == "terminateApp" {
            serverProcess?.terminate()
            NSApp.terminate(nil)
        } else if message.name == "uninstallApp" {
            var deleteData = false
            var deleteWorlds = false
            var deleteBackups = false
            var deleteSettings = false
            if let dict = message.body as? [String: Any] {
                deleteData = (dict["deleteData"] as? Bool) ?? false
                deleteWorlds = (dict["deleteWorlds"] as? Bool) ?? deleteData
                deleteBackups = (dict["deleteBackups"] as? Bool) ?? deleteData
                deleteSettings = (dict["deleteSettings"] as? Bool) ?? deleteData
            }
            performUninstall(deleteData: deleteData, deleteWorlds: deleteWorlds, deleteBackups: deleteBackups, deleteSettings: deleteSettings)
        }
    }

    func performUninstall(deleteData: Bool, deleteWorlds: Bool = false, deleteBackups: Bool = false, deleteSettings: Bool = false) {
        serverProcess?.terminate()

        let fm = FileManager.default
        let homeURL = fm.homeDirectoryForCurrentUser

        // 0. Vider et réinitialiser toutes les données WebKit (LocalStorage, cookies, caches)
        let dataStore = WKWebsiteDataStore.default()
        dataStore.removeData(ofTypes: WKWebsiteDataStore.allWebsiteDataTypes(), modifiedSince: Date.distantPast) { }

        let webkitDirs = [
            homeURL.appendingPathComponent("Library/WebKit/com.gabriel.cubirium"),
            homeURL.appendingPathComponent("Library/WebKit/fr.gabriel.cubirium"),
            homeURL.appendingPathComponent("Library/WebKit/Cubirium"),
            homeURL.appendingPathComponent("Library/Caches/com.gabriel.cubirium"),
            homeURL.appendingPathComponent("Library/Caches/fr.gabriel.cubirium"),
            homeURL.appendingPathComponent("Library/Saved Application State/com.gabriel.cubirium.savedState"),
            homeURL.appendingPathComponent("Library/Saved Application State/fr.gabriel.cubirium.savedState"),
            homeURL.appendingPathComponent("Library/WebKit/com.gabriel.minecraftservermanager"),
            homeURL.appendingPathComponent("Library/WebKit/fr.gabriel.minecraftservermanager"),
            homeURL.appendingPathComponent("Library/WebKit/Minecraft Server Manager"),
            homeURL.appendingPathComponent("Library/Caches/com.gabriel.minecraftservermanager"),
            homeURL.appendingPathComponent("Library/Caches/fr.gabriel.minecraftservermanager"),
            homeURL.appendingPathComponent("Library/Saved Application State/com.gabriel.minecraftservermanager.savedState"),
            homeURL.appendingPathComponent("Library/Saved Application State/fr.gabriel.minecraftservermanager.savedState")
        ]
        for dir in webkitDirs {
            try? fm.removeItem(at: dir)
        }

        // 1. Supprimer les raccourcis sur le bureau
        let desktopURL = homeURL.appendingPathComponent("Desktop")
        let link1 = desktopURL.appendingPathComponent("Cubirium.app")
        let link2 = desktopURL.appendingPathComponent("Cubirium")
        let legacyLink1 = desktopURL.appendingPathComponent("Minecraft Server Manager.app")
        let legacyLink2 = desktopURL.appendingPathComponent("Minecraft Server Manager")
        try? fm.removeItem(at: link1)
        try? fm.removeItem(at: link2)
        try? fm.removeItem(at: legacyLink1)
        try? fm.removeItem(at: legacyLink2)

        // 2. Supprimer les données du serveur si demandé
        let appSupportDir = homeURL.appendingPathComponent("Library/Application Support/Cubirium")
        let legacyAppSupportDir = homeURL.appendingPathComponent("Library/Application Support/MinecraftServerManager")
        if deleteData || (deleteWorlds && deleteSettings && deleteBackups) {
            try? fm.removeItem(at: appSupportDir)
            try? fm.removeItem(at: legacyAppSupportDir)
        } else {
            if deleteWorlds {
                try? fm.removeItem(at: appSupportDir.appendingPathComponent("games"))
                try? fm.removeItem(at: legacyAppSupportDir.appendingPathComponent("games"))
            }
            if deleteBackups {
                try? fm.removeItem(at: appSupportDir.appendingPathComponent("backups"))
                try? fm.removeItem(at: legacyAppSupportDir.appendingPathComponent("backups"))
            }
            if deleteSettings {
                try? fm.removeItem(at: appSupportDir.appendingPathComponent("app-settings.json"))
                try? fm.removeItem(at: legacyAppSupportDir.appendingPathComponent("app-settings.json"))
            }
        }

        // 4. Supprimer l'application dans /Applications
        let appInApplications = URL(fileURLWithPath: "/Applications/Cubirium.app")
        let legacyAppInApplications = URL(fileURLWithPath: "/Applications/Minecraft Server Manager.app")
        let currentBundle = Bundle.main.bundleURL

        try? fm.removeItem(at: appInApplications)
        try? fm.removeItem(at: legacyAppInApplications)
        if fm.fileExists(atPath: appInApplications.path) {
            NSWorkspace.shared.recycle([appInApplications], completionHandler: nil)
        }
        if fm.fileExists(atPath: legacyAppInApplications.path) {
            NSWorkspace.shared.recycle([legacyAppInApplications], completionHandler: nil)
        }

        if currentBundle.path != appInApplications.path && currentBundle.path.hasSuffix(".app") && currentBundle.path.hasPrefix("/Applications/") {
            try? fm.removeItem(at: currentBundle)
            if fm.fileExists(atPath: currentBundle.path) {
                NSWorkspace.shared.recycle([currentBundle], completionHandler: nil)
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            NSApp.terminate(nil)
        }
    }

    // Ouvrir les popups ou liens target=_blank directement dans le navigateur externe par défaut (Safari, Chrome...)
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // Gestion native des boîtes de dialogue de sélection de fichiers (Finder)
    func webView(_ webView: WKWebView, runOpenPanelWith parameters: WKOpenPanelParameters, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping ([URL]?) -> Void) {
        let panel = NSOpenPanel()
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.allowsMultipleSelection = parameters.allowsMultipleSelection
        panel.canCreateDirectories = false
        panel.prompt = "Sélectionner"
        panel.message = "Sélectionnez vos fichiers ou dossiers"
        panel.begin { result in
            if result == .OK {
                completionHandler(panel.urls)
            } else {
                completionHandler(nil)
            }
        }
    }

    // Boîte de dialogue d'alerte native JavaScript alert()
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = NSAlert()
        alert.messageText = "Cubirium"
        alert.informativeText = message
        alert.alertStyle = .informational
        alert.addButton(withTitle: "OK")
        if let w = self.window {
            alert.beginSheetModal(for: w) { _ in
                completionHandler()
            }
        } else {
            alert.runModal()
            completionHandler()
        }
    }

    // Boîte de dialogue de confirmation native JavaScript confirm()
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = NSAlert()
        alert.messageText = "Confirmation"
        alert.informativeText = message
        alert.alertStyle = .warning
        alert.addButton(withTitle: "Confirmer")
        alert.addButton(withTitle: "Annuler")
        if let w = self.window {
            alert.beginSheetModal(for: w) { response in
                completionHandler(response == .alertFirstButtonReturn)
            }
        } else {
            let res = alert.runModal()
            completionHandler(res == .alertFirstButtonReturn)
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        serverProcess?.terminate()
        NSApp.terminate(nil)
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        serverProcess?.terminate()
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.regular)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
