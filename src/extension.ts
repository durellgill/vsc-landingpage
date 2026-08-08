import { join } from 'path';
import * as vscode from 'vscode';
import { window } from 'vscode';
import { bookmarkUris, cloneRepository, handleMessageFromWebview, refreshRecents, registerExtensionContext, resetModel } from './LandingPage/communication';
import { syncModelInWebview } from './LandingPage/webview-messages';
import { LandingPageModel } from './LandingPage/LandingPageModel';
import { LandingPageTemplate } from './LandingPage/LandingPageTemplate';

/** Runs an extension action and reports failures without leaving a rejected command promise. */
async function runLandingPageAction(action:()=>Promise<void>):Promise<void>
{
	try
	{
		await action();
	}
	catch (error)
	{
		console.error('Landing Page action failed:', error);
		await vscode.window.showErrorMessage('Landing Page could not complete that action. Your latest change may not have been saved.');
	}
}

export function activate(context: vscode.ExtensionContext) 
{
	registerExtensionContext(context);

	let landingpageWebviewPanel:vscode.WebviewPanel|null = null;
	// Loaded here rather than when the panel opens, because the Explorer context menu can add
	// bookmarks in a window where the landing page was never shown. Starting from an empty
	// model there would save over the user's stored groups.
	let model:LandingPageModel = context.globalState.get<LandingPageModel>('landingPageModel') || {groups:[]};

	const cmdReset = vscode.commands.registerCommand('vsc-landingpage.reset', async () => {
		const answer = await vscode.window.showWarningMessage("Reset content of landingpage? This will remove all custom bookmarks and groups. This cannot be undone.", "Yes", "No");
		if (answer === "Yes")
		{
			await runLandingPageAction(async () => {
				await resetModel(model);
				if (landingpageWebviewPanel) {syncModelInWebview(landingpageWebviewPanel, model);}
			});
		}
	});
	context.subscriptions.push(cmdReset);

	const cmdReload = vscode.commands.registerCommand('vsc-landingpage.reload', () => {
		if (landingpageWebviewPanel) {syncModelInWebview(landingpageWebviewPanel!, model);}
	});
	context.subscriptions.push(cmdReload);

	// Same code path as the refresh control on the Recent group header, see communication.ts.
	const cmdRefreshRecents = vscode.commands.registerCommand('vsc-landingpage.refreshRecents', async () => {
		if (landingpageWebviewPanel) {await refreshRecents(landingpageWebviewPanel, model);}
	});
	context.subscriptions.push(cmdRefreshRecents);

	// Same code path as the Clone button in the webview, see communication.ts.
	const cmdClone = vscode.commands.registerCommand('vsc-landingpage.cloneRepository', async () => {
		await cloneRepository();
	});
	context.subscriptions.push(cmdClone);

	// Explorer context menu: "Add to Landing Page Group". VS Code passes the clicked resource as
	// the first argument and the full multi-selection as the second, which is undefined when the
	// command is run from the palette with an active editor.
	const cmdAddBookmark = vscode.commands.registerCommand('vsc-landingpage.addToGroup', async (uri?:vscode.Uri, uris?:vscode.Uri[]) => {
		const selection = (uris && uris.length>0) ? uris : (uri ? [uri] : (vscode.window.activeTextEditor ? [vscode.window.activeTextEditor.document.uri] : []));
		await runLandingPageAction(() => bookmarkUris(selection, model, landingpageWebviewPanel));
	});
	context.subscriptions.push(cmdAddBookmark);

	const cmdShowWelcomePage = vscode.commands.registerCommand('vsc-landingpage.showWelcomePage', async() => 
	{
		try 
		{
			if (landingpageWebviewPanel)
			{
				landingpageWebviewPanel.reveal();
				return;
			}

			const panelIconPath = {
					light: vscode.Uri.file(join(context.extensionPath, 'assets', 'icon.png')),
					dark: vscode.Uri.file(join(context.extensionPath, 'assets',  'icon.png'))
			};

			landingpageWebviewPanel = window.createWebviewPanel(
					'vsc-landingpage',
					'Landing Page',
					vscode.ViewColumn.One,
					{
							enableScripts: true,
							// The webview only ever loads the cursor PNGs and the panel icon,
							// so restrict local content to the assets folder.
							localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'assets')],
							// retainContextWhenHidden: true,
					}
			);

			landingpageWebviewPanel.iconPath = panelIconPath;

			/** Webview-accessible path to extension assets, required to load custom cursors. */
			const assetPath:vscode.Uri = landingpageWebviewPanel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'assets'));

			model = context.globalState.get<LandingPageModel>('landingPageModel')|| {groups:[]};

			landingpageWebviewPanel.webview.onDidReceiveMessage(async message => {
				await runLandingPageAction(() => handleMessageFromWebview(message, landingpageWebviewPanel!, model));
			}, undefined, context.subscriptions);
			landingpageWebviewPanel.webview.html = new LandingPageTemplate().makeHTML(assetPath, landingpageWebviewPanel.webview.cspSource);

			landingpageWebviewPanel.onDidDispose(()=>{landingpageWebviewPanel=null;});

			// The Recent group mirrors VS Code's history, which changes while this panel sits in a
			// background tab - opening a project in another window is the usual case. Refresh when
			// the panel comes back into view so the user never reads a stale list.
			landingpageWebviewPanel.onDidChangeViewState(async event => {
				if (event.webviewPanel.visible) {await refreshRecents(event.webviewPanel, model);}
			}, undefined, context.subscriptions);

			// (No MRU read here: the webview's `documentReady` message triggers
			// populateVscMru() immediately afterwards, so doing it here only duplicated the work.)
		}
		catch (err: any) 
		{
			console.error(`vsc-landingpage: Exception opening extension: ${JSON.stringify(err.message)}`);
		}

	});
	context.subscriptions.push(cmdShowWelcomePage);

	context.subscriptions.push(
			vscode.commands.registerCommand('vsc-landingpage.focusInput', () => {
				if (landingpageWebviewPanel) {landingpageWebviewPanel.webview.postMessage({ command: 'setFocusToFilterInput' });}
			})
	);
	
	
	if (vscode.workspace.getConfiguration('vsc-landingpage').get<boolean>('autoshowOnStartup')===true && !vscode.workspace.workspaceFolders)
	{
		vscode.commands.executeCommand('vsc-landingpage.showWelcomePage');
	}
}

export function deactivate() 
{

}
