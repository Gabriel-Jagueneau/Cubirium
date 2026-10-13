#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, NSWindowDelegate, WKNavigationDelegate>
@property (strong) NSWindow *window;
@property (strong) WKWebView *webView;
@property (strong) NSTask *nodeTask;
@property (assign) BOOL ownsNodeServer;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)aNotification {
    [self ensureServerRunning];



    // Calcul de la taille de l'écran et centrage
    NSRect screenRect = [[NSScreen mainScreen] visibleFrame];
    CGFloat initialWidth = MIN(1280.0, MAX(1040.0, screenRect.size.width * 0.88));
    CGFloat initialHeight = MIN(860.0, MAX(680.0, screenRect.size.height * 0.85));
    NSRect windowRect = NSMakeRect(0, 0, initialWidth, initialHeight);

    NSUInteger styleMask = NSWindowStyleMaskTitled |
                           NSWindowStyleMaskClosable |
                           NSWindowStyleMaskMiniaturizable |
                           NSWindowStyleMaskResizable;

    self.window = [[NSWindow alloc] initWithContentRect:windowRect
                                              styleMask:styleMask
                                                backing:NSBackingStoreBuffered
                                                  defer:NO];
    [self.window center];
    [self.window setTitle:@"Cubirium"];
    [self.window setMinSize:NSMakeSize(960, 620)];
    [self.window setDelegate:self];
    [self.window setReleasedWhenClosed:NO];
    [self.window setBackgroundColor:[NSColor colorWithRed:13.0/255.0 green:17.0/255.0 blue:23.0/255.0 alpha:1.0]];

    // Configuration de la WKWebView
    WKWebViewConfiguration *config = [[WKWebViewConfiguration alloc] init];
    [config.preferences setValue:@YES forKey:@"developerExtrasEnabled"];

    self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:config];
    [self.webView setAutoresizingMask:(NSViewWidthSizable | NSViewHeightSizable)];
    [self.webView setNavigationDelegate:self];
    
    // Empêcher le fond blanc de flasher au chargement
    [self.webView setValue:@NO forKey:@"drawsBackground"];
    [self.window.contentView addSubview:self.webView];

    [self setupMenuBar];

    [self.window makeKeyAndOrderFront:nil];
    [NSApp activateIgnoringOtherApps:YES];

    [self loadAppURLWithRetry:15];
}

- (void)ensureServerRunning {
    if ([self isServerListening]) {
        self.ownsNodeServer = NO;
        return;
    }

    // Lancer le serveur Node.js en arrière-plan
    NSString *appBundlePath = [[NSBundle mainBundle] bundlePath];
    NSString *parentDir = [appBundlePath stringByDeletingLastPathComponent];
    NSString *serverScript = [parentDir stringByAppendingPathComponent:@"manager/src/server.js"];
    NSString *workingDir = [parentDir stringByAppendingPathComponent:@"manager"];

    NSMutableArray *possibleNodes = [NSMutableArray arrayWithObjects:
        @"/opt/homebrew/bin/node",
        @"/usr/local/bin/node",
        @"/usr/bin/node",
        nil
    ];
    NSString *homeDir = NSHomeDirectory();
    NSString *nvmDir = [homeDir stringByAppendingPathComponent:@".nvm/versions/node"];
    NSArray *nvmVersions = [[NSFileManager defaultManager] contentsOfDirectoryAtPath:nvmDir error:nil];
    if (nvmVersions) {
        for (NSString *ver in nvmVersions) {
            NSString *cand = [NSString stringWithFormat:@"%@/%@/bin/node", nvmDir, ver];
            [possibleNodes addObject:cand];
        }
    }

    NSString *nodeBin = nil;
    for (NSString *p in possibleNodes) {
        if ([[NSFileManager defaultManager] isExecutableFileAtPath:p]) {
            nodeBin = p;
            break;
        }
    }
    if (!nodeBin) nodeBin = @"node";

    @try {
        self.nodeTask = [[NSTask alloc] init];
        self.nodeTask.launchPath = nodeBin;
        self.nodeTask.arguments = @[serverScript];
        self.nodeTask.currentDirectoryPath = workingDir;

        NSMutableDictionary *env = [NSMutableDictionary dictionaryWithDictionary:[[NSProcessInfo processInfo] environment]];
        NSString *currentPath = env[@"PATH"] ?: @"";
        env[@"PATH"] = [NSString stringWithFormat:@"/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:%@", currentPath];
        self.nodeTask.environment = env;

        [self.nodeTask launch];
        self.ownsNodeServer = YES;
    } @catch (NSException *e) {
        NSLog(@"Erreur lors du lancement de node: %@", e);
    }
}

- (BOOL)isServerListening {
    NSURL *url = [NSURL URLWithString:@"http://localhost:4567/api/status"];
    NSMutableURLRequest *req = [NSMutableURLRequest requestWithURL:url];
    req.timeoutInterval = 0.4;
    
    dispatch_semaphore_t sem = dispatch_semaphore_create(0);
    __block BOOL running = NO;
    
    [[[NSURLSession sharedSession] dataTaskWithRequest:req completionHandler:^(NSData *data, NSURLResponse *res, NSError *err) {
        if ([(NSHTTPURLResponse *)res statusCode] == 200) {
            running = YES;
        }
        dispatch_semaphore_signal(sem);
    }] resume];
    
    dispatch_semaphore_wait(sem, dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.5 * NSEC_PER_SEC)));
    return running;
}

- (void)loadAppURLWithRetry:(int)remainingAttempts {
    NSURL *url = [NSURL URLWithString:@"http://localhost:4567"];
    if ([self isServerListening] || remainingAttempts <= 0) {
        [self.webView loadRequest:[NSURLRequest requestWithURL:url]];
    } else {
        dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.3 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
            [self loadAppURLWithRetry:remainingAttempts - 1];
        });
    }
}

- (void)setupMenuBar {
    NSMenu *mainMenu = [[NSMenu alloc] init];

    // Menu Application
    NSMenuItem *appMenuItem = [[NSMenuItem alloc] init];
    [mainMenu addItem:appMenuItem];

    NSMenu *appMenu = [[NSMenu alloc] initWithTitle:@"Cubirium"];
    NSString *appName = @"Cubirium";
    [appMenu addItemWithTitle:[NSString stringWithFormat:@"À propos de %@", appName]
                       action:@selector(orderFrontStandardAboutPanel:)
                keyEquivalent:@""];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:@"Recharger la page"
                       action:@selector(reloadPage:)
                keyEquivalent:@"r"];
    [appMenu addItem:[NSMenuItem separatorItem]];
    [appMenu addItemWithTitle:[NSString stringWithFormat:@"Quitter %@", appName]
                       action:@selector(terminate:)
                keyEquivalent:@"q"];
    [appMenuItem setSubmenu:appMenu];

    // Menu Édition (pour copier/coller dans l'application)
    NSMenuItem *editMenuItem = [[NSMenuItem alloc] init];
    [mainMenu addItem:editMenuItem];
    NSMenu *editMenu = [[NSMenu alloc] initWithTitle:@"Édition"];
    [editMenu addItemWithTitle:@"Annuler" action:@selector(undo:) keyEquivalent:@"z"];
    [editMenu addItemWithTitle:@"Rétablir" action:@selector(redo:) keyEquivalent:@"Z"];
    [editMenu addItem:[NSMenuItem separatorItem]];
    [editMenu addItemWithTitle:@"Couper" action:@selector(cut:) keyEquivalent:@"x"];
    [editMenu addItemWithTitle:@"Copier" action:@selector(copy:) keyEquivalent:@"c"];
    [editMenu addItemWithTitle:@"Coller" action:@selector(paste:) keyEquivalent:@"v"];
    [editMenu addItemWithTitle:@"Tout sélectionner" action:@selector(selectAll:) keyEquivalent:@"a"];
    [editMenuItem setSubmenu:editMenu];

    // Menu Fenêtre
    NSMenuItem *windowMenuItem = [[NSMenuItem alloc] init];
    [mainMenu addItem:windowMenuItem];
    NSMenu *windowMenu = [[NSMenu alloc] initWithTitle:@"Fenêtre"];
    [windowMenu addItemWithTitle:@"Réduire" action:@selector(performMiniaturize:) keyEquivalent:@"m"];
    [windowMenu addItemWithTitle:@"Zoom" action:@selector(performZoom:) keyEquivalent:@""];
    [windowMenuItem setSubmenu:windowMenu];

    [NSApp setMainMenu:mainMenu];
}

- (void)reloadPage:(id)sender {
    [self.webView reload];
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
    return YES;
}

- (void)applicationWillTerminate:(NSNotification *)notification {
    if (self.ownsNodeServer && self.nodeTask && [self.nodeTask isRunning]) {
        [self.nodeTask terminate];
    }
}

@end

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        NSApplication *app = [NSApplication sharedApplication];
        [app setActivationPolicy:NSApplicationActivationPolicyRegular];

        AppDelegate *delegate = [[AppDelegate alloc] init];
        [app setDelegate:delegate];

        [app run];
    }
    return 0;
}
