import { join } from 'path';
import * as vscode from 'vscode';
import { window } from 'vscode';
import { bookmarkUris, cloneRepository, handleMessageFromWebview, refreshRecents, registerExtensionContext, resetModel } from './LandingPage/communication';
import { syncModelInWebview } from './LandingPage/webview-messages';
import { LandingPageModel } from './LandingPage/LandingPageModel';
import { LandingPageTemplate } from './LandingPage/LandingPageTemplate';

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

	const cmdRefreshRecents = vscode.commands.registerCommand('vsc-landingpage.refreshRecents', async () => {
		if (landingpageWebviewPanel) {await refreshRecents(landingpageWebviewPanel, model);}
	});
	context.subscriptions.push(cmdRefreshRecents);

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

		const openInNewWorkspace = async (uri?:vscode.Uri, uris?:vscode.Uri[]) => {
		const targetUri = (uris && uris.length>0) ? uris[0] : uri;
		if (!targetUri) {return;}

		let folderUri = targetUri;
		try {
			const stat = await vscode.workspace.fs.stat(targetUri);
			if (stat.type !== vscode.FileType.Directory) {
				folderUri = vscode.Uri.joinPath(targetUri, '..');
			}
		} catch (error) {
			console.error('Failed to stat URI:', error);
			return;
		}

		await vscode.commands.executeCommand('vscode.openFolder', folderUri, { forceNewWindow: true });

		if (process.platform === 'darwin' && vscode.workspace.getConfiguration('window').get('nativeTabs') !== true) {
			const enable = 'Enable native tabs';
			const choice = await vscode.window.showInformationMessage('Opened in a new window. Enable macOS native tabs to open these as tabs instead.', enable);
			if (choice === enable) {
				await vscode.workspace.getConfiguration('window').update('nativeTabs', true, vscode.ConfigurationTarget.Global);
			}
		}
	};
	context.subscriptions.push(vscode.commands.registerCommand('vsc-landingpage.openInNewWorkspace', openInNewWorkspace));
	context.subscriptions.push(vscode.commands.registerCommand('vsc-landingpage.openParentInNewWorkspace', openInNewWorkspace));

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
								// The page inlines its assets, so its webview requires no local resource roots.
								localResourceRoots: [],
					}
			);

			landingpageWebviewPanel.iconPath = panelIconPath;

			model = context.globalState.get<LandingPageModel>('landingPageModel')|| {groups:[]};

			landingpageWebviewPanel.webview.onDidReceiveMessage(async message => {
				await runLandingPageAction(() => handleMessageFromWebview(message, landingpageWebviewPanel!, model));
			}, undefined, context.subscriptions);
			landingpageWebviewPanel.webview.html = new LandingPageTemplate().makeHTML(landingpageWebviewPanel.webview.cspSource);

			landingpageWebviewPanel.onDidDispose(()=>{landingpageWebviewPanel=null;});

				landingpageWebviewPanel.onDidChangeViewState(async event => {
				if (event.webviewPanel.visible) {await refreshRecents(event.webviewPanel, model);}
			}, undefined, context.subscriptions);
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
