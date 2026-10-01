using System;
using System.Drawing;
using System.IO;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace Angband3D.Desktop;

public class MainForm : Form
{
    private readonly WebView2 _webView;
    private bool _isFullScreen = false;
    private FormBorderStyle _previousBorderStyle;
    private FormWindowState _previousWindowState;
    private Rectangle _previousBounds;

    public MainForm(string[] args)
    {
        Text = "Angband 3D — First-Person Roguelike";
        BackColor = Color.FromArgb(3, 4, 7);
        ForeColor = Color.White;
        MinimumSize = new Size(960, 600);
        Size = new Size(1366, 800);
        StartPosition = FormStartPosition.CenterScreen;
        Icon = TryLoadIcon();

        _webView = new WebView2
        {
            Dock = DockStyle.Fill,
            DefaultBackgroundColor = Color.FromArgb(3, 4, 7)
        };

        Controls.Add(_webView);

        KeyPreview = true;
        KeyDown += MainForm_KeyDown;
        FormClosing += MainForm_FormClosing;

        InitializeWebViewAsync();
    }

    private static Icon? TryLoadIcon()
    {
        try
        {
            var baseDir = AppDomain.CurrentDomain.BaseDirectory;
            var candidates = new[]
            {
                Path.Combine(baseDir, "icon.ico"),
                Path.Combine(baseDir, "client", "icon.ico"),
                Path.Combine(baseDir, "..", "..", "client", "icon.ico")
            };
            foreach (var p in candidates)
            {
                if (File.Exists(p)) return new Icon(p);
            }
        }
        catch { }
        return null;
    }

    private async void InitializeWebViewAsync()
    {
        try
        {
            var webDir = FindWebDirectory();
            if (string.IsNullOrEmpty(webDir) || !Directory.Exists(webDir))
            {
                MessageBox.Show(
                    "Could not locate Angband3D web assets directory (server/public or www).\n\nPlease ensure game assets are extracted properly.",
                    "Angband 3D - Missing Assets",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Error);
                Application.Exit();
                return;
            }

            var userDataFolder = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "Angband3D",
                "UserData"
            );
            Directory.CreateDirectory(userDataFolder);

            var options = new CoreWebView2EnvironmentOptions(
                additionalBrowserArguments: "--enable-features=SharedArrayBuffer,UnrestrictedSharedArrayBuffer --allow-file-access-from-files"
            );

            var env = await CoreWebView2Environment.CreateAsync(null, userDataFolder, options);
            await _webView.EnsureCoreWebView2Async(env);

            _webView.CoreWebView2.Settings.IsStatusBarEnabled = false;
            _webView.CoreWebView2.Settings.AreDefaultContextMenusEnabled = false;
            _webView.CoreWebView2.Settings.AreDevToolsEnabled = true;

            // Map virtual host name to local game assets directory
            _webView.CoreWebView2.SetVirtualHostNameToFolderMapping(
                "angband3d.local",
                webDir,
                CoreWebView2HostResourceAccessKind.Allow
            );

            _webView.Source = new Uri("https://angband3d.local/index.html");
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                $"Failed to initialize Angband 3D engine:\n\n{ex.Message}\n\nPlease verify that the Microsoft Edge WebView2 Runtime is installed.",
                "Angband 3D - Initialization Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
            Application.Exit();
        }
    }

    private static string? FindWebDirectory()
    {
        var baseDir = AppDomain.CurrentDomain.BaseDirectory;
        var candidates = new[]
        {
            Path.Combine(baseDir, "www"),
            Path.Combine(baseDir, "server", "public"),
            Path.Combine(baseDir, "..", "server", "public"),
            Path.Combine(baseDir, "..", "..", "server", "public"),
            Path.Combine(baseDir, "..", "..", "..", "server", "public")
        };

        foreach (var c in candidates)
        {
            var full = Path.GetFullPath(c);
            if (Directory.Exists(full) && File.Exists(Path.Combine(full, "index.html")))
            {
                return full;
            }
        }
        return null;
    }

    private void MainForm_KeyDown(object? sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.F11 || (e.Alt && e.KeyCode == Keys.Enter))
        {
            ToggleFullScreen();
            e.Handled = true;
        }
        else if (e.KeyCode == Keys.F12)
        {
            _webView.CoreWebView2?.OpenDevToolsWindow();
            e.Handled = true;
        }
    }

    private void ToggleFullScreen()
    {
        if (!_isFullScreen)
        {
            _previousBorderStyle = FormBorderStyle;
            _previousWindowState = WindowState;
            _previousBounds = Bounds;

            FormBorderStyle = FormBorderStyle.None;
            WindowState = FormWindowState.Normal;
            Bounds = Screen.FromControl(this).Bounds;
            _isFullScreen = true;
        }
        else
        {
            FormBorderStyle = _previousBorderStyle;
            WindowState = _previousWindowState;
            Bounds = _previousBounds;
            _isFullScreen = false;
        }
    }

    private void MainForm_FormClosing(object? sender, FormClosingEventArgs e)
    {
        // Graceful exit
    }
}
