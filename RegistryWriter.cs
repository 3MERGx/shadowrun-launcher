using System;
using System.Windows.Forms;
using Microsoft.Win32;
using System.Diagnostics;
using System.IO;

class RegistryWriter
{
    static void Main(string[] args)
    {
        try
        {
            // Create a log file for debugging
            string logPath = Path.Combine(Path.GetTempPath(), "RegistryWriter_log.txt");
            using (StreamWriter log = new StreamWriter(logPath, true))
            {
                log.WriteLine($"RegistryWriter started at {DateTime.Now}");
                log.WriteLine($"Arguments received: {string.Join(", ", args)}");
                
                // Show a message to confirm admin operation is starting
                MessageBox.Show(
                    "This operation requires administrator privileges.\n\nA UAC prompt will appear next.",
                    "Registry Operation",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                
                log.WriteLine("Initial message box shown");
                
                if (args.Length < 1)
                {
                    log.WriteLine("Error: No PCID value provided");
                    MessageBox.Show("No PCID value provided", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return;
                }

                string pcidValue = args[0];
                log.WriteLine($"PCID value: {pcidValue}");
                
                // Convert the hex string to a long value
                long pcidLong = Convert.ToInt64(pcidValue, 16);
                log.WriteLine($"Converted to long: {pcidLong}");
                
                // Open the registry key (will trigger UAC prompt due to manifest)
                log.WriteLine("Attempting to open registry key...");
                RegistryKey key = Registry.CurrentUser.CreateSubKey(@"Software\Classes\SOFTWARE\Microsoft\XLive", true);
                log.WriteLine("Registry key opened successfully");
                
                // Write the PCID backup value
                log.WriteLine("Writing PCID backup value...");
                key.SetValue("SRPCIDBACKUP", pcidLong, RegistryValueKind.QWord);
                key.Close();
                log.WriteLine("Registry write completed successfully");
                
                MessageBox.Show(
                    "PCID backup created successfully!\n\nValue: 0x" + pcidValue,
                    "Success",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Information
                );
                log.WriteLine("Success message shown");
            }
        }
        catch (Exception ex)
        {
            // Log the error to a file
            string errorLogPath = Path.Combine(Path.GetTempPath(), "RegistryWriter_error.txt");
            using (StreamWriter errorLog = new StreamWriter(errorLogPath, true))
            {
                errorLog.WriteLine($"Error at {DateTime.Now}: {ex.Message}");
                errorLog.WriteLine($"Stack trace: {ex.StackTrace}");
            }
            
            MessageBox.Show(
                "Error: " + ex.Message + "\n\nPlease make sure you accepted the admin prompt.\n\nDetails have been logged to: " + errorLogPath,
                "Registry Write Error",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error
            );
        }
    }
} 