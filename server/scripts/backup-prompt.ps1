# Shows a Yes/No popup every time Task Scheduler runs this (every 4 hours). Only runs the
# backup (pg_dump + JSON data export + zipped uploads/ files) if the user clicks Yes —
# nothing happens silently.
Add-Type -AssemblyName System.Windows.Forms

$result = [System.Windows.Forms.MessageBox]::Show(
    "Run BharathComic database backup now?",
    "BharathComic Backup",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Question
)

if ($result -eq [System.Windows.Forms.DialogResult]::Yes) {
    Set-Location "C:\Users\Athithiya.V.S\BharathComic\server"
    node scripts\backupDb.js
    node scripts\exportData.js
    node scripts\backupUploads.js
    node scripts\backupEnv.js
    [System.Windows.Forms.MessageBox]::Show("Backup complete.", "BharathComic Backup", [System.Windows.Forms.MessageBoxButtons]::OK, [System.Windows.Forms.MessageBoxIcon]::Information) | Out-Null
}
