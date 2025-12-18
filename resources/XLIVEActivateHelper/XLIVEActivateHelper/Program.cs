using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Xml.Linq;
using System.IO;
using System.IO.Pipes;

namespace XLiveActivateHelper
{
    internal static class Program
    {
        //Title ID for Shadowrun (2007).
        //4D5307D6
        public static readonly string Shadowrun_Folder = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData) + "\\Microsoft\\XLive\\Titles\\4D5307D6";


        // Exit codes (for Electron)
        private const int EXIT_SUCCESS = 0;
        private const int EXIT_INVALID_ARGS = 1; //Unused but legacy stuff
        private const int EXIT_DLL_NOT_FOUND = 2; //Unused but legacy stuff
        private const int EXIT_CALL_FAILED = 3; // Unused but legacy stuff
        private const int EXIT_ERROR_INVALID_KEY_OR_ARGS = 3;
        private const int EXIT_ERROR_CANNOT_DELETE_XMACS_DATA = 4;
        private const int EXIT_ERROR_INITIALIZE_OR_CODE_EXECUTION_FAILED_GENERIC = 5;
        private const int EXIT_ERROR_CANNOT_WRITE_XMACS_DATA = 6;
        private const int EXIT_ERROR_CANNOT_CREATE_XMACS_FOLDER = 7;




        /// <summary>
        /// This Validates and checks the Product key to see if it is valid.
        /// </summary>
        /// <param name="args">Pass the Main() arguments to here</param>
        /// <param name="key">This is to return the proper key back to the Main()</param>
        /// <returns>The status of the key if it is valid as a bool.</returns>
        static bool ValidateKey(string[] args, ref string key)
        {
            // Validate arguments
            if (args.Length < 1 || string.IsNullOrWhiteSpace(args[0]))
            {
                Console.Error.WriteLine("ERROR: Missing product key argument.");
                Console.Error.WriteLine("Usage: XLiveActivateHelper.exe <PRODUCT_KEY>");
                return false;
            }

            //trims and returns the valid key back to Main()
            string productKey = args[0].Trim();
            key = productKey;

            if (productKey.Length != 29)
            {
                Console.WriteLine("Does not equal to 29 characters");
                return false;
            }

            // Basic validation (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX format)
            if (!IsLikelyProductKey(productKey))
            {
                Console.Error.WriteLine("BlackAnt's KeyWriter: Error: Invalid product key format.");
                Console.Error.WriteLine("BlackAnt's KeyWriter: Expected format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX");
                return false;
            }

            return true;
        }

        /// <summary>
        /// This checks if the folder in specified path exists.
        /// </summary>
        /// <param name="path">the literal to the folder.</param>
        /// <returns>boolen value of the status of the folder existing or not.</returns>
        static bool IfTitleFolderExists(string path)
        {
            return Directory.Exists(path);
        }

        /// <summary>
        /// Deletes both Config.bin and Token.bin
        /// </summary>
        /// <param name="path">the folder to XMACS Data</param>
        /// <returns>True if successful or Exit's app if failure with exit code EXIT_ERROR_CANNOT_DELETE_XMACS_DATA</returns>
        static bool IfXMACSDataExistsThenDelete(string path)
        {
            if (File.Exists(path + "\\config.bin"))
            {
                try
                {
                    File.Delete(path + "\\config.bin");
                }
                catch
                {
                    Console.WriteLine("BlackAnt's KeyWriter: Config.bin failed to delete");
                    Environment.Exit(EXIT_ERROR_CANNOT_DELETE_XMACS_DATA);
                    return false;
                }
            }
            if (File.Exists(path + "\\Token.bin"))
            {
                try
                {
                    File.Delete(path + "\\Token.bin");
                }
                catch
                {
                    Console.WriteLine("BlackAnt's KeyWriter: Token.bin failed to delete");
                    Environment.Exit(EXIT_ERROR_CANNOT_DELETE_XMACS_DATA);
                    return false;
                }
            }
            return true;
        }

        static bool WriteXMACSData(string folder, byte[] data)
        {
            try
            {
                File.WriteAllBytes(folder + "\\Token.bin", data);
            }
            catch
            {
                Environment.Exit(EXIT_ERROR_CANNOT_WRITE_XMACS_DATA);
            }
            return true;
        }
        /// <summary>
        /// This does what the name says
        /// </summary>
        /// <param name="path">location to create the folder</param>
        /// <returns>true if successful</returns>
        static bool CreateFolder(string path)
        {
            try
            {
                Directory.CreateDirectory(path);
            }
            catch
            {
                Environment.Exit(EXIT_ERROR_CANNOT_CREATE_XMACS_FOLDER);
            }
            return true;
        }

        static void Main(string[] args)
        {
            Console.WriteLine("BlackAnt's KeyWriter: Starting...");
            
            // REMOVED: Hardcoded test key (was overriding actual product key from launcher)
            // args = new string[] { "AAAAA-AAAAA-AAAAA-AAAAA-AAAAA" };
            try
            {
                string productKey = null;
                if (!ValidateKey(args, ref productKey))
                {
                    Environment.Exit(EXIT_ERROR_INVALID_KEY_OR_ARGS);
                }
                Console.WriteLine("BlackAnt's KeyWriter: Writing Key: " + productKey);
                byte[] SponsorTokenToEncrypt = new byte[29];
                Encoding.Default.GetBytes(productKey, 0, 29, SponsorTokenToEncrypt, 0);
                byte[] EncryptedSponsorToken = Crypt32.Encrypt(SponsorTokenToEncrypt);
                string TokenBinDataString = "0000" + Convert.ToHexString(BitConverter.GetBytes((UInt16)EncryptedSponsorToken.Length)) + Convert.ToHexString(EncryptedSponsorToken);
                bool folderexists = IfTitleFolderExists(Shadowrun_Folder);
                if (folderexists == true)
                {
                    IfXMACSDataExistsThenDelete(Shadowrun_Folder);
                    WriteXMACSData(Shadowrun_Folder, Convert.FromHexString(TokenBinDataString));
                    Environment.Exit(EXIT_SUCCESS);
                }
                if (folderexists == false)
                {
                    CreateFolder(Shadowrun_Folder);
                    WriteXMACSData(Shadowrun_Folder, Convert.FromHexString(TokenBinDataString));
                    Environment.Exit(EXIT_SUCCESS);
                }
                //Console.WriteLine("Product key is " + productKey);
                Console.WriteLine("Product bytes is " + TokenBinDataString);
                //Console.WriteLine("Shadowrun Activation Folder: " + Shadowrun_Folder);
                //Console.WriteLine("XMACS Data deletion status: " + IfXMACSDataExistsThenDelete(Shadowrun_Folder));

            }
            catch
            {
                Environment.Exit(EXIT_ERROR_INITIALIZE_OR_CODE_EXECUTION_FAILED_GENERIC);
            }
        }

        /// <summary>
        /// Part of Validate Key
        /// </summary>
        /// <param name="key">This checks the key for the Character "-"</param>
        /// <returns>the status of the key check</returns>
        private static bool IsLikelyProductKey(string key)
        {
            // Very light validation - just check length and dashes
            // Format: XXXXX-XXXXX-XXXXX-XXXXX-XXXXX (29 chars with dashes)
            return key.Length >= 29 && key.Contains("-");
        }
    }
}

