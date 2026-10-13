import Cocoa

class InstallerAppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        let fm = FileManager.default
        let bundleURL = Bundle.main.bundleURL
        
        // 1. Chercher le payload de l'application
        var sourceAppURL = bundleURL.appendingPathComponent("Contents/Resources/Cubirium.app")
        if !fm.fileExists(atPath: sourceAppURL.path) {
            // Fallback si dans le même dossier
            sourceAppURL = bundleURL.deletingLastPathComponent().appendingPathComponent("Cubirium.app")
        }
        if !fm.fileExists(atPath: sourceAppURL.path) {
            // Fallback legacy
            sourceAppURL = bundleURL.appendingPathComponent("Contents/Resources/Minecraft Server Manager.app")
        }

        let destAppURL = URL(fileURLWithPath: "/Applications/Cubirium.app")

        // 2. Copier dans /Applications
        if fm.fileExists(atPath: destAppURL.path) {
            try? fm.removeItem(at: destAppURL)
        }

        do {
            try fm.copyItem(at: sourceAppURL, to: destAppURL)
        } catch {
            let cpProc = Process()
            cpProc.executableURL = URL(fileURLWithPath: "/bin/cp")
            cpProc.arguments = ["-R", sourceAppURL.path, destAppURL.path]
            try? cpProc.run()
            cpProc.waitUntilExit()
        }

        // 3. Retirer les attributs de quarantaine
        let xattrProc = Process()
        xattrProc.executableURL = URL(fileURLWithPath: "/usr/bin/xattr")
        xattrProc.arguments = ["-cr", destAppURL.path]
        try? xattrProc.run()
        xattrProc.waitUntilExit()

        // 4. Créer un unique raccourci sur le Bureau (.app)
        if let desktopURL = fm.urls(for: .desktopDirectory, in: .userDomainMask).first {
            let legacyURL1 = desktopURL.appendingPathComponent("Minecraft Server Manager")
            let legacyURL2 = desktopURL.appendingPathComponent("Minecraft Server Manager.app")
            let legacyURL3 = desktopURL.appendingPathComponent("Cubirium")
            let appShortcutURL = desktopURL.appendingPathComponent("Cubirium.app")
            try? fm.removeItem(at: legacyURL1)
            try? fm.removeItem(at: legacyURL2)
            try? fm.removeItem(at: legacyURL3)
            try? fm.removeItem(at: appShortcutURL)
            if let bookmarkData = try? destAppURL.bookmarkData(options: .suitableForBookmarkFile, includingResourceValuesForKeys: nil, relativeTo: nil) {
                try? URL.writeBookmarkData(bookmarkData, to: appShortcutURL)
            } else {
                try? fm.createSymbolicLink(at: appShortcutURL, withDestinationURL: destAppURL)
            }
        }

        // 5. Lancer l'application
        NSWorkspace.shared.open(destAppURL)

        // 6. Éjecter le DMG et quitter
        let dmgRoot = bundleURL.deletingLastPathComponent()
        let detachProc = Process()
        detachProc.executableURL = URL(fileURLWithPath: "/usr/bin/hdiutil")
        detachProc.arguments = ["detach", dmgRoot.path, "-force"]
        try? detachProc.run()

        exit(0)
    }
}

let app = NSApplication.shared
let delegate = InstallerAppDelegate()
app.delegate = delegate
app.run()
