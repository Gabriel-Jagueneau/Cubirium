using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

namespace Cubirium
{
    static class Program
    {
        [STAThread]
        static void Main()
        {
            string appDir = AppDomain.CurrentDomain.BaseDirectory;
            string managerDir = Path.Combine(appDir, "manager");
            if (!Directory.Exists(managerDir)) managerDir = appDir;

            string nodeBin = "node";
            string localNode1 = Path.Combine(appDir, "bin", "node.exe");
            string localNode2 = Path.Combine(managerDir, "bin", "node.exe");
            if (File.Exists(localNode1)) nodeBin = localNode1;
            else if (File.Exists(localNode2)) nodeBin = localNode2;

            string serverJs = Path.Combine(managerDir, "src", "server.js");

            // 1. Démarrer le serveur Node.js en arrière-plan
            Process serverProcess = null;
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo(nodeBin, "\"" + serverJs + "\"");
                psi.WorkingDirectory = managerDir;
                psi.CreateNoWindow = true;
                psi.UseShellExecute = false;
                serverProcess = Process.Start(psi);
            }
            catch (Exception ex)
            {
                MessageBox.Show("Impossible de démarrer le serveur local : " + ex.Message, "Cubirium", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return;
            }

            Thread.Sleep(1500);

            // 2. Trouver Microsoft Edge pour exécuter en mode App autonome
            string edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Microsoft\\Edge\\Application\\msedge.exe");
            if (!File.Exists(edge))
            {
                edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), "Microsoft\\Edge\\Application\\msedge.exe");
            }

            Process edgeProcess = null;
            if (File.Exists(edge))
            {
                ProcessStartInfo edgePsi = new ProcessStartInfo(edge, "--app=http://127.0.0.1:4567 --window-size=1280,820");
                edgePsi.UseShellExecute = true;
                edgeProcess = Process.Start(edgePsi);
            }
            else
            {
                Process.Start("http://127.0.0.1:4567");
            }

            // 3. Attendre la fermeture de la fenêtre
            if (edgeProcess != null)
            {
                edgeProcess.WaitForExit();
                try
                {
                    if (serverProcess != null && !serverProcess.HasExited)
                    {
                        serverProcess.Kill();
                    }
                }
                catch { }
            }
        }
    }
}
